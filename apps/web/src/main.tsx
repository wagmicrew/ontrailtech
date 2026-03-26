import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './index.css';
import './i18n';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'cmn7iq1in001u0dl5ttvqs1pr';

const config = createConfig(
  getDefaultConfig({
    chains: [base, baseSepolia],
    transports: {
      [base.id]: http(),
      [baseSepolia.id]: http(),
    },
    walletConnectProjectId: import.meta.env.VITE_WC_PROJECT_ID || '75e29a9e66a4a448b52cf0e0945058d6',
    appName: 'OnTrail',
    appDescription: 'Web3 SocialFi for Explorers',
    appUrl: 'https://ontrail.tech',
  }),
);

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google'],
        appearance: {
          theme: 'light',
          accentColor: '#22c55e',
          logo: 'https://ontrail.tech/logo.png',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <ConnectKitProvider theme="rounded" mode="light">
            <AuthProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </AuthProvider>
          </ConnectKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  </React.StrictMode>,
);
