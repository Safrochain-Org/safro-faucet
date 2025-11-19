import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wallet, ArrowRight, Copy, Check, RefreshCw, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getRequestsLimit, sendTransaction } from '@/services/api';

interface FaucetFormProps {
  tokenAmount?: number;
  tokenSymbol?: string;
}

const FaucetForm = ({ tokenAmount = 250, tokenSymbol = "SAF" }: FaucetFormProps) => {
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requestsLimit, setRequestsLimit] = useState(3); // Default fallback
  const { toast } = useToast();

  // Fetch dynamic requests limit from database
  useEffect(() => {
    const fetchRequestsLimit = async () => {
      try {
        const limit = await getRequestsLimit();
        setRequestsLimit(limit);
      } catch (error) {
        console.error('Error fetching requests limit:', error);
        // Keep default value
      }
    };

    fetchRequestsLimit();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!address.startsWith('addr_safro')) {
      toast({
        title: "Invalid address",
        description: "Address must start with 'addr_safro'",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      const rawTxResult = await sendTransaction(address);

      if (!rawTxResult || !rawTxResult.transactionHash) {
        const errMsg =
          rawTxResult.error ||
          "No transaction hash returned from faucet. Please try again.";
        console.error("Transaction unexpected response:", rawTxResult);
        toast({
          title: "Transaction error",
          description: (
            <div className="max-w-[340px] break-words">{String(errMsg)}</div>
          ),
          variant: "destructive",
        });
        return;
      }

      const txData = {
        transactionHash: rawTxResult.transactionHash,
        chainId: rawTxResult.chainId || 'safrochain',
        blockHeight: rawTxResult.height?.toString(),
        amount: rawTxResult.amount || { denom: tokenSymbol.toLowerCase(), amount: String(tokenAmount) },
        senderAddress: rawTxResult.senderAddress,
        receiverAddress: rawTxResult.receiverAddress || address,
        memo: rawTxResult.memo || 'Sending tokens with safrochain faucet',
        senderBalance: rawTxResult.senderBalance,
        receiverBalance: rawTxResult.receiverBalance,
        gasUsed: rawTxResult.gasUsed?.toString(),
        gasWanted: rawTxResult.gasWanted?.toString()
      };

      toast({
        title: "Success! 🎉",
        description: (
          <a 
            href={rawTxResult.explorerTxUrl || `https://explorer.testnet.safrochain.com/safrochain/tx/${txData.transactionHash}`}
            target="_blank" 
            rel="noreferrer"
            className="text-blue-400 underline hover:text-blue-300 transition-colors inline-flex items-center gap-1"
          >
            View transaction on Safrochain Explorer
            <ArrowRight className="h-3 w-3 inline" />
          </a>
        ),
      });
      
      // Clear form on success
      setAddress('');
    } catch (error: any) {
      console.error("Transaction error:", error);
      
      const isRateLimit = error.rateLimitType || 
                         error.status === 429 ||
                         (error.error && isRateLimitErrorMessage(error.error));
      
      if (isRateLimit) {
        showRateLimitInfo(
          `You have reached the ${requestsLimit} requests per day limit. Please wait until tomorrow to request more test tokens.`,
          error.rateLimitType
        );
      } else {
        toast({
          title: "Request Failed",
          description: "Unable to process your request at the moment. Please try again later.",
          variant: "destructive",
        });
      }
      return;
    } finally {
      setIsLoading(false);
    }
  };

  const isRateLimitErrorMessage = (message: string): boolean => {
    if (!message) return false;
    return (
      message.includes('429') ||
      message.includes('Rate limit') ||
      message.includes('daily limit') ||
      message.includes('Too Many Requests') ||
      message.includes('per 24h')
    );
  };

  const showRateLimitInfo = (message?: string, rateLimitType?: string) => {
    let title = "Daily Limit Reached";
    let description = "You've successfully used all your faucet requests for today! 🎉";
    let additionalInfo = "Come back in 24 hours for more test tokens.";
    
    if (rateLimitType === "ip") {
      description = "Your network has reached today's faucet limit.";
      additionalInfo = "Try from a different network or wait 24 hours to request more tokens.";
    } else if (rateLimitType === "address") {
      description = "This wallet has reached today's faucet limit.";
      additionalInfo = "Use a different wallet address or wait 24 hours for more tokens.";
    } else if (rateLimitType === "both") {
      description = "Both your network and wallet have reached today's limit.";
      additionalInfo = "Please wait 24 hours before requesting more test tokens.";
    } else if (!rateLimitType) {
      description = "You have reached your daily faucet limit.";
      additionalInfo = "You can request more tokens in 24 hours. Try using a different network or wallet if needed.";
    }
    
    toast({
      title,
      description: (
        <div className="space-y-3">
          <div className="flex items-start">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
              <span className="text-blue-600 dark:text-blue-400 text-sm">ℹ️</span>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{description}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{additionalInfo}</p>
            </div>
          </div>
          <div className="ml-11 p-2 rounded-md bg-gray-50 dark:bg-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              💡 <strong>Tip:</strong> The faucet resets every 24 hours to ensure fair distribution of test tokens.
            </p>
          </div>
        </div>
      ),
    });
    setIsLoading(false);
  };

  const CopyButton = ({ textToCopy }: { textToCopy: string }) => {
    const [isCopied, setIsCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    };
    return (
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={handleCopy} 
        className="hover:bg-blue-500/10 p-1.5 sm:p-1 min-w-[32px] min-h-[32px] touch-manipulation transition-colors"
        tabIndex={-1}
        aria-label="Copy address"
        type="button"
      >
        {isCopied ? (
          <Check className="h-4 w-4 text-green-500 transition-all" />
        ) : (
          <Copy className="h-4 w-4 text-slate-400 hover:text-blue-400 active:text-blue-500 transition-colors" />
        )}
      </Button>
    );
  };

  return (
    <form 
      onSubmit={handleSubmit} 
      className="w-full max-w-3xl mx-auto
                 rounded-2xl border border-white/10 
                 bg-white/80 dark:bg-slate-800/80
                 backdrop-blur-xl
                 shadow-2xl
                 overflow-hidden 
                 transition-all duration-300 hover:shadow-blue-500/20
                 relative"
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-blue-50/30 to-cyan-50/50 dark:from-slate-900/50 dark:via-blue-900/20 dark:to-cyan-900/30 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col md:flex-row items-stretch gap-0">
        {/* Left: Form Fields */}
        <div className="flex flex-col flex-1 justify-center px-6 sm:px-8 md:px-10 py-8 sm:py-10 gap-5 sm:gap-6 w-full md:border-r md:border-slate-200/50 dark:md:border-slate-700/50">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Request Test Tokens
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 hidden sm:block">
              Enter your Safrochain address to receive test tokens
            </p>
          </div>

          {/* Input */}
          <div className="space-y-2">
            <label htmlFor="safro-address" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Safrochain Address
            </label>
            <div className="relative">
              <Wallet className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500 z-10 pointer-events-none" />
              <Input
                id="safro-address"
                type="text"
                placeholder="addr_safro1..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="pl-11 pr-11 h-12 md:h-12 text-base text-slate-900 dark:text-slate-100 
                  bg-white dark:bg-slate-900/50 
                  border border-slate-200 dark:border-slate-700 
                  shadow-sm
                  rounded-xl
                  focus:border-blue-500 dark:focus:border-blue-400 
                  focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20
                  transition-all duration-200 touch-manipulation
                  placeholder:text-slate-400 dark:placeholder:text-slate-500"
                required
                maxLength={90}
                autoFocus={typeof window !== 'undefined' && window.innerWidth > 768}
                disabled={isLoading}
              />
              {address && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <CopyButton textToCopy={address} />
                </div>
              )}
            </div>
          </div>

          {/* Helper text */}
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Address must start with <span className="font-semibold text-blue-600 dark:text-blue-400">addr_safro</span>
            <span className="hidden sm:inline"> • Limit: {requestsLimit} requests per 24h per IP and wallet</span>
            <span className="sm:hidden"> • {requestsLimit}/day limit</span>
          </p>
        </div>

        {/* Right: Action & Amount */}
        <div className="flex flex-row md:flex-col justify-between items-center md:items-end 
          flex-shrink-0 
          border-t md:border-t-0 md:border-l border-slate-200/50 dark:border-slate-700/50
          px-6 sm:px-8 md:px-8 lg:px-10 
          py-6 sm:py-8 
          gap-4 sm:gap-5
          bg-gradient-to-r md:bg-gradient-to-b from-slate-50/50 to-white/50 dark:from-slate-800/50 dark:to-slate-900/50
          w-full md:w-auto md:min-w-[240px] lg:min-w-[260px]">
          
          {/* Token amount badge */}
          <div className="hidden md:flex items-center gap-2 md:mb-5 order-1 md:order-none">
            <div className="flex flex-col items-center sm:items-start gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">You'll receive</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 text-transparent bg-clip-text">
                  {tokenAmount}
                </span>
                <span className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-300">
                  {tokenSymbol}
                </span>
              </div>
            </div>
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            className="w-full sm:w-auto md:w-full px-8 sm:px-10 py-3 sm:py-3.5 text-base rounded-xl font-semibold 
              flex items-center justify-center gap-2
              bg-gradient-to-r from-blue-600 to-cyan-600 
              hover:from-blue-700 hover:to-cyan-700
              dark:from-blue-500 dark:to-cyan-500
              dark:hover:from-blue-600 dark:hover:to-cyan-600
              text-white
              shadow-lg shadow-blue-500/25
              hover:shadow-xl hover:shadow-blue-500/30
              transition-all duration-200
              min-w-[160px] sm:min-w-[180px] md:min-w-0
              flex-1 sm:flex-none md:flex-initial
              touch-manipulation
              order-2 md:order-none
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg"
            disabled={isLoading || !address}
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span className="hidden sm:inline">Processing...</span>
                <span className="sm:hidden">Processing</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Request Tokens</span>
                <span className="sm:hidden">Request</span>
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
};

export default FaucetForm;
