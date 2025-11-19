// API client to replace Supabase calls

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:3009';

interface FaucetConfig {
    id: number;
    denom: string;
    amount: string;
    prefix: string;
    memo: string;
    explorer_url_prefix: string;
    requests_limit_per_day: number;
    created_at: string | null;
    updated_at: string | null;
}

interface TransactionRequest {
    receiver: string;
}

interface TransactionResponse {
    success: boolean;
    transactionHash?: string;
    chainId?: string;
    height?: number;
    amount?: { denom: string; amount: string };
    senderAddress?: string;
    receiverAddress?: string;
    memo?: string;
    senderBalance?: Array<{ denom: string; amount: string }>;
    receiverBalance?: Array<{ denom: string; amount: string }>;
    gasUsed?: string;
    gasWanted?: string;
    explorerTxUrl?: string;
    error?: string;
    rateLimitType?: 'ip' | 'address' | 'both';
}

interface ApiError {
    error: string;
    success: boolean;
    rateLimitType?: 'ip' | 'address' | 'both';
    message?: string;
}

// Fetch faucet configuration
export async function getFaucetConfig(): Promise<FaucetConfig> {
    const response = await fetch(`${API_BASE_URL}/api/config`);

    if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
    }

    return response.json();
}

// Fetch requests limit per day
export async function getRequestsLimit(): Promise<number> {
    try {
        const config = await getFaucetConfig();
        return config.requests_limit_per_day || 3;
    } catch (error) {
        console.error('Error fetching requests limit:', error);
        return 3; // Default fallback
    }
}

// Send transaction
export async function sendTransaction(receiver: string): Promise<TransactionResponse> {
    const response = await fetch(`${API_BASE_URL}/api/transaction`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ receiver }),
    });

    const data = await response.json();

    // Handle rate limit errors
    if (response.status === 429) {
        const error: ApiError = {
            error: data.error || 'Rate limit exceeded',
            success: false,
            rateLimitType: data.rateLimitType,
        };
        throw error;
    }

    // Handle other errors
    if (!response.ok) {
        const error: ApiError = {
            error: data.error || `Request failed: ${response.statusText}`,
            success: false,
            message: data.message,
        };
        throw error;
    }

    return data as TransactionResponse;
}

