import FaucetForm from '@/components/FaucetForm';
import { useEffect, useState } from "react";
import { getFaucetConfig } from "@/services/api";

const Index = () => {
  const [tokenAmount, setTokenAmount] = useState<number | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string | null>(null);
  const [requestsLimit, setRequestsLimit] = useState<number>(3); // Default fallback
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const config = await getFaucetConfig();
        if (config) {
          setTokenAmount(Number(config.amount));
          setTokenSymbol(config.denom?.toUpperCase() || "SAF");
          setRequestsLimit(config.requests_limit_per_day || 3);
        } else {
          setTokenAmount(250);
          setTokenSymbol("SAF");
          setRequestsLimit(3);
        }
      } catch (error) {
        console.error('Error fetching config:', error);
        setTokenAmount(250);
        setTokenSymbol("SAF");
        setRequestsLimit(3);
      }
      setLoading(false);
    };
    fetchConfig();
  }, []);

  // Update document title and meta description for SEO
  useEffect(() => {
    const symbol = tokenSymbol || "SAF";
    const amount = tokenAmount || 250;
    
    document.title = `Safrochain Testnet Faucet - Get ${amount} Free ${symbol} Test Tokens`;
    
    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        'content',
        `Request ${amount} free ${symbol} test tokens for Safrochain testnet. Instantly receive test tokens to build, test, and deploy dApps. Limited to ${requestsLimit} requests per day.`
      );
    }
    
    // Update Open Graph description
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) {
      ogDescription.setAttribute(
        'content',
        `Request ${amount} free ${symbol} test tokens for Safrochain testnet. Instantly receive test tokens to build, test, and deploy dApps.`
      );
    }
  }, [tokenAmount, tokenSymbol, requestsLimit]);

  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col justify-center items-center px-4 py-8 sm:px-6 sm:py-12 md:px-8 md:py-16">
        <article className="flex flex-col justify-center items-center gap-8 sm:gap-10 md:gap-12 max-w-4xl w-full mx-auto">
          {/* Branding and Information */}
          <header className="flex flex-col justify-center items-center text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="relative">
              <img 
                src="https://i.ibb.co/99q9HK6D/Safrochain-Logo.png" 
                alt="Safrochain Blockchain Logo - Testnet Faucet for Free Test Tokens" 
                className="h-20 sm:h-24 md:h-28 mb-2 drop-shadow-2xl transition-transform duration-300 hover:scale-105"
                height="192"
                loading="eager"
              />
            </div>
            
            <div className="space-y-3">
              <h1 className="font-extrabold mb-2 bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 text-transparent bg-clip-text text-3xl sm:text-4xl md:text-5xl leading-tight tracking-tight">
                Safrochain Testnet Faucet
              </h1>
              <p className="text-sm sm:text-base md:text-lg font-normal text-slate-300/90 max-w-2xl mx-auto px-4 leading-relaxed">
                Request free test tokens to build and test your dApps on Safrochain. Fast, simple, and developer-friendly.
              </p>
            </div>

            {/* Token amount badge */}
            <div className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 shadow-lg">
              <span className="text-xs sm:text-sm text-slate-300/80 font-medium">Amount</span>
              <div className="h-4 w-px bg-slate-500/50" />
              <span 
                className="font-bold text-base sm:text-lg text-white" 
                aria-label={`Token amount: ${tokenAmount ?? 250} ${tokenSymbol ?? "SAF"}`}
              >
                {loading ? (
                  <span className="inline-block w-16 h-5 bg-slate-600/30 rounded animate-pulse" aria-hidden="true" />
                ) : (
                  `${tokenAmount ?? 250} ${tokenSymbol ?? "SAF"}`
                )}
              </span>
              <span className="hidden sm:inline text-xs sm:text-sm text-slate-400">per request</span>
            </div>

            {/* Info text */}
            <p className="text-xs sm:text-sm text-slate-400/80 max-w-xl mx-auto px-4 leading-relaxed">
              For testnet use only • Limited to <span className="font-semibold text-slate-300">{requestsLimit}</span> request{requestsLimit !== 1 ? 's' : ''} per day per address
            </p>
          </header>

          {/* The Request Form */}
          <section className="w-full animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200" aria-label="Token request form">
            <FaucetForm tokenAmount={tokenAmount ?? 250} tokenSymbol={tokenSymbol ?? "SAF"} />
          </section>
        </article>

        {/* Footer */}
        <footer className="mt-12 sm:mt-16 w-full text-center text-xs sm:text-sm text-slate-500/70 py-4 max-w-2xl mx-auto px-4 animate-in fade-in duration-1000 delay-300" role="contentinfo">
          <p>Safrochain Testnet Faucet • For developers and testing only</p>
        </footer>
      </div>
    </main>
  );
};

export default Index;
