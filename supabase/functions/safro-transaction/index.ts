
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

// Helper to fetch faucet config from Supabase
async function fetchFaucetConfig() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://phqtdczpawzuvdpbxarn.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY secret is not set");
  }
  const url = `${SUPABASE_URL}/rest/v1/safro_faucet_config?select=*&order=id.desc&limit=1`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch faucet config from Supabase: ${resp.statusText}`);
  }
  const configArr = await resp.json();
  if (!configArr.length) {
    throw new Error("No faucet config found in Supabase table");
  }
  return configArr[0];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Custom JSON stringifier for BigInt
const JSONStringifyWithBigInt = (obj: unknown): string =>
  JSON.stringify(obj, (_, value) => (typeof value === "bigint" ? value.toString() : value));

// Helper: Insert request info to user_requests table
async function insertUserRequest({ ip_address, region, user_agent, receiver_address, success, transaction_hash }: {
  ip_address: string,
  region: string | null,
  user_agent: string | null,
  receiver_address: string,
  success: boolean,
  transaction_hash: string | null,
}) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://phqtdczpawzuvdpbxarn.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/user_requests`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      ip_address,
      region,
      user_agent,
      receiver_address,
      success,
      transaction_hash,
    }),
  });
  // do not throw on insert errors; just log
  if (!resp.ok) {
    console.error("Failed to log user request:", await resp.text());
  }
}

// Helper: Count successful requests by IP in last 24h
async function getRequestCountByIp(ip: string, sinceISO: string) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://phqtdczpawzuvdpbxarn.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = `${SUPABASE_URL}/rest/v1/user_requests?ip_address=eq.${ip}&success=eq.true&request_timestamp=gte.${sinceISO}&select=id`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    }
  });
  if (!resp.ok) return 0;
  const arr = await resp.json();
  return Array.isArray(arr) ? arr.length : 0;
}

// Helper: Count successful requests by address in last 24h
async function getRequestCountByAddress(address: string, sinceISO: string) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://phqtdczpawzuvdpbxarn.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = `${SUPABASE_URL}/rest/v1/user_requests?receiver_address=eq.${address}&success=eq.true&request_timestamp=gte.${sinceISO}&select=id`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    }
  });
  if (!resp.ok) return 0;
  const arr = await resp.json();
  return Array.isArray(arr) ? arr.length : 0;
}

// Helper: Try to geolocate user's region (optional)
async function fetchRegion(ip: string): Promise<string | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return null;
  try {
    // Using ipinfo.io (free, returns country)
    const resp = await fetch(`https://ipinfo.io/${ip}/json`);
    if (!resp.ok) return null;
    const json = await resp.json();
    // Return combined country and region if available
    return json.country ? [json.country, json.region, json.city].filter(Boolean).join(", ") : null;
  } catch {
    return null;
  }
}

async function sendTokens(receiverAddress: string) {
  console.log("Starting transaction process...");
  // Note: This function handles sequence numbers properly to prevent sequence mismatch errors.
  // Since Supabase functions are stateless, we can't maintain an in-memory queue,
  // but proper sequence handling and retries should prevent most conflicts.
  // Fetch config dynamically
  const config = await fetchFaucetConfig();
  const {
    mnemonic: MNEMONIC,
    rpc_endpoint: RPC_ENDPOINT,
    denom: DENOM,
    amount: AMOUNT_VALUE,
    prefix: PREFIX,
    memo: MEMO,
    explorer_url_prefix: EXPLORER_TX_URL_PREFIX = "https://rpcsafro.cardanotask.com/tx?hash=0x",
  } = config;

  // Import CosmJS and utilities inside function for edge runtime compatibility
  const { DirectSecp256k1HdWallet } = await import("npm:@cosmjs/proto-signing");
  const { SigningStargateClient } = await import("npm:@cosmjs/stargate");
  const { stringToPath } = await import("npm:@cosmjs/crypto");
  const { validateMnemonic } = await import("npm:bip39");

  try {
    if (!MNEMONIC || MNEMONIC.split(" ").length < 12 || !validateMnemonic(MNEMONIC)) {
      throw new Error("Invalid or missing MNEMONIC configuration");
    }
    if (!RPC_ENDPOINT || !DENOM || !AMOUNT_VALUE || !PREFIX) {
      throw new Error("Missing required configuration (rpc_endpoint, denom, amount, or prefix)");
    }
    const amount = [{ denom: DENOM, amount: AMOUNT_VALUE }];
    // Debug
    console.log("RPC Endpoint:", RPC_ENDPOINT);
    console.log("Receiver Address:", receiverAddress);
    console.log("Denom:", DENOM);
    console.log("Amount:", amount);
    console.log("Prefix:", PREFIX);
    console.log("Memo:", MEMO);

    // Ensure RPC endpoint has a protocol
    let rpcEndpointWithProtocol = RPC_ENDPOINT;
    if (!RPC_ENDPOINT.startsWith('http://') && !RPC_ENDPOINT.startsWith('https://')) {
      rpcEndpointWithProtocol = `https://${RPC_ENDPOINT}`;
      console.log("Added https:// protocol to RPC endpoint:", rpcEndpointWithProtocol);
    }

    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
      prefix: PREFIX,
      hdPaths: [stringToPath("m/44'/118'/0'/0/0")],
    });
    const [senderAccount] = await wallet.getAccounts();
    const senderAddress = senderAccount.address;
    
    // Fee configuration
    const fee = {
      amount: [{ denom: DENOM, amount: "5000" }],
      gas: "200000",
    };

    // Helper function to wait for sequence to stabilize
    async function waitForSequenceStable(client: any, address: string, expectedSequence: number, maxWaitMs: number = 10000): Promise<number> {
      const startTime = Date.now();
      let lastSequence = expectedSequence;
      let stableCount = 0;
      const requiredStableChecks = 5; // Sequence must be stable for 5 consecutive checks (increased from 3)
      
      while (Date.now() - startTime < maxWaitMs) {
        const account = await client.getAccount(address);
        const currentSequence = account ? account.sequence : 0;
        
        if (currentSequence === lastSequence) {
          stableCount++;
          if (stableCount >= requiredStableChecks) {
            console.log(`Sequence stabilized at ${currentSequence} after ${stableCount} checks`);
            // One final check right before returning
            await new Promise(resolve => setTimeout(resolve, 1000));
            const finalAccount = await client.getAccount(address);
            const finalSequence = finalAccount ? finalAccount.sequence : 0;
            if (finalSequence !== currentSequence) {
              console.log(`Sequence changed during final check: ${currentSequence} -> ${finalSequence}, restarting`);
              lastSequence = finalSequence;
              stableCount = 1;
              continue;
            }
            return finalSequence;
          }
        } else {
          console.log(`Sequence changed: ${lastSequence} -> ${currentSequence}, resetting stability check`);
          lastSequence = currentSequence;
          stableCount = 1;
        }
        
        await new Promise(resolve => setTimeout(resolve, 800)); // Increased from 500ms
      }
      
      console.log(`Sequence check timeout, using last known sequence: ${lastSequence}`);
      return lastSequence;
    }

    // Helper function to wait for transaction to be included and sequence to update
    async function waitForSequenceUpdate(client: any, address: string, previousSequence: number, maxWaitMs: number = 10000): Promise<number> {
      const startTime = Date.now();
      const targetSequence = previousSequence + 1;
      
      while (Date.now() - startTime < maxWaitMs) {
        const account = await client.getAccount(address);
        const currentSequence = account ? account.sequence : 0;
        
        if (currentSequence >= targetSequence) {
          console.log(`Sequence updated: ${previousSequence} -> ${currentSequence}`);
          return currentSequence;
        }
        
        console.log(`Waiting for sequence update... current: ${currentSequence}, expected: ${targetSequence}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Final check
      const account = await client.getAccount(address);
      const finalSequence = account ? account.sequence : 0;
      console.log(`Sequence update check completed. Final sequence: ${finalSequence}`);
      return finalSequence;
    }

    // Retry logic with sequence number handling
    // Create a fresh client for each retry to avoid sequence caching issues
    let retries = 5;
    let result;
    let txError;
    
    while (retries > 0) {
      // Create a fresh client for each attempt to avoid sequence caching
      const freshClient = await SigningStargateClient.connectWithSigner(rpcEndpointWithProtocol, wallet);
      
      try {
        // Wait for sequence to stabilize before sending transaction
        // This ensures we're using the most up-to-date sequence
        console.log("Waiting for sequence to stabilize...");
        const stableSequence = await waitForSequenceStable(freshClient, senderAddress, 0, 10000);
        console.log(`Using stable sequence: ${stableSequence} for transaction`);
        
        // Final sequence check right before signing
        await new Promise(resolve => setTimeout(resolve, 1000));
        const finalCheck = await freshClient.getAccount(senderAddress);
        const finalSequence = finalCheck ? finalCheck.sequence : 0;
        if (finalSequence !== stableSequence) {
          throw new Error(`Sequence changed right before signing: expected ${stableSequence}, got ${finalSequence}. Retrying...`);
        }
        
        console.log(`Attempt ${6 - retries}/5: Sending transaction with sequence ${finalSequence}...`);
        
        result = await freshClient.signAndBroadcast(
          senderAddress,
          [
            {
              typeUrl: "/cosmos.bank.v1beta1.MsgSend",
              value: {
                fromAddress: senderAddress,
                toAddress: receiverAddress,
                amount,
              },
            },
          ],
          fee,
          MEMO
        );
        console.log("Raw transaction result:", result);
        console.log("Transaction successful!");
        console.log("Transaction hash:", result.transactionHash);
        console.log("Block height:", result.height);

        // Wait for the transaction to be included and sequence to update
        console.log("Waiting for transaction to be included and sequence to update...");
        await waitForSequenceUpdate(freshClient, senderAddress, finalSequence, 15000); // Increased timeout

        const chainId = await freshClient.getChainId();
        const senderBalance = await freshClient.getAllBalances(senderAddress);
        const receiverBalance = await freshClient.getAllBalances(receiverAddress);
        const processedResult = {
          success: true,
          transactionHash: result.transactionHash,
          chainId: chainId,
          height: result.height,
          amount: amount[0],
          senderAddress: senderAddress,
          receiverAddress: receiverAddress,
          memo: MEMO,
          senderBalance: senderBalance,
          receiverBalance: receiverBalance,
          gasUsed: result.gasUsed ? result.gasUsed.toString() : undefined,
          gasWanted: result.gasWanted ? result.gasWanted.toString() : undefined,
          explorerTxUrl: `${EXPLORER_TX_URL_PREFIX}${result.transactionHash}`,
        };

        return processedResult;
      } catch (error) {
        const errorMessage = error.message || String(error);
        console.error("Transaction error:", errorMessage);
        console.error("Raw transaction error response:", error.response || error);
        
        // Check if it's a sequence mismatch error
        const isSequenceError = errorMessage.includes('sequence') || 
                                errorMessage.includes('account sequence mismatch') ||
                                errorMessage.includes('incorrect account sequence');
        
        if (isSequenceError) {
          console.log("Sequence mismatch detected, waiting longer and will retry with fresh client...");
          // Wait longer for sequence errors to allow the chain to update
          // Also wait for sequence to stabilize
          await new Promise(resolve => setTimeout(resolve, 5000)); // Increased from 3000ms
        } else {
          // For other errors, wait a shorter time
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        txError = error;
        retries -= 1;
        if (retries > 0) {
          console.log(`Retrying transaction... (${5 - retries}/5)`);
        }
      }
    }
    if (retries === 0) {
      throw new Error(`Transaction failed after multiple retries: ${txError?.message}`);
    }
    return { success: false, error: "Unknown error" };
  } catch (error) {
    console.error("Error sending tokens:", error.message);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let ip = "";
  let user_agent: string | null = null;
  let region: string | null = null;
  let receiver_address = "";
  let tx_success = false;
  let tx_hash: string | null = null;

  try {
    // Extract IP: try headers, then req.conn (not available), fallback to null
    ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      ""; // Empty string if not found

    user_agent = req.headers.get("user-agent") || null;

    const requestData = await req.json();
    receiver_address = requestData.receiver;
    // Fetch config for prefix and IP rate limit
    const config = await fetchFaucetConfig();
    const PREFIX = config.prefix;
    const REQUESTS_LIMIT = config.requests_limit_per_day || 3;

    // IP is required for rate limiting
    if (!ip) {
      return new Response(
        JSON.stringify({ error: "IP address could not be determined", success: false }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    // 24 hour window for rate limiting
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // Check IP-based rate limiting
    const ipRequestCount = await getRequestCountByIp(ip, since);
    console.log(`IP ${ip}: ${ipRequestCount}/${REQUESTS_LIMIT} requests in last 24h`);
    
    // Check address-based rate limiting
    const addressRequestCount = await getRequestCountByAddress(receiver_address, since);
    console.log(`Address ${receiver_address}: ${addressRequestCount}/${REQUESTS_LIMIT} requests in last 24h`);
    
    // Enforce rate limits with specific error messages
    if (ipRequestCount >= REQUESTS_LIMIT && addressRequestCount >= REQUESTS_LIMIT) {
      // Both limits exceeded
      await insertUserRequest({
        ip_address: ip,
        region: null,
        user_agent,
        receiver_address,
        success: false,
        transaction_hash: null,
      });
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Both your IP address and wallet address have reached the maximum of ${REQUESTS_LIMIT} faucet requests per 24 hours.`,
          success: false,
          rateLimitType: "both"
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } else if (ipRequestCount >= REQUESTS_LIMIT) {
      // IP limit exceeded
      await insertUserRequest({
        ip_address: ip,
        region: null,
        user_agent,
        receiver_address,
        success: false,
        transaction_hash: null,
      });
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Your IP address has reached the maximum of ${REQUESTS_LIMIT} faucet requests per 24 hours.`,
          success: false,
          rateLimitType: "ip"
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } else if (addressRequestCount >= REQUESTS_LIMIT) {
      // Address limit exceeded
      await insertUserRequest({
        ip_address: ip,
        region: null,
        user_agent,
        receiver_address,
        success: false,
        transaction_hash: null,
      });
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. This wallet address has already received the maximum of ${REQUESTS_LIMIT} faucet requests per 24 hours.`,
          success: false,
          rateLimitType: "address"
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Prefix validation
    if (!receiver_address || !receiver_address.startsWith(PREFIX)) {
      // Log as failed (invalid address)
      await insertUserRequest({
        ip_address: ip,
        region: null,
        user_agent,
        receiver_address,
        success: false,
        transaction_hash: null,
      });
      return new Response(
        JSON.stringify({ error: `Invalid receiver address. Must start with: ${PREFIX}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Try to fetch region as extra metadata (non-blocking)
    region = await fetchRegion(ip);

    // Core transaction logic
    const result = await sendTokens(receiver_address);
    tx_success = Boolean(result && result.success);
    tx_hash = tx_success && result.transactionHash ? String(result.transactionHash) : null;

    // Log success attempt
    await insertUserRequest({
      ip_address: ip,
      region,
      user_agent,
      receiver_address,
      success: tx_success,
      transaction_hash: tx_hash,
    });

    return new Response(
      JSONStringifyWithBigInt(result),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    // Try to log failed attempt
    try {
      await insertUserRequest({
        ip_address: ip,
        region,
        user_agent,
        receiver_address,
        success: false,
        transaction_hash: null,
      });
    } catch {}
    console.error("Error in request handler:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unknown error occurred",
        success: false,
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
