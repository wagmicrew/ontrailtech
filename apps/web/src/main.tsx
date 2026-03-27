import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './index.css';
import './i18n';

const adobeFontsKitId = import.meta.env.VITE_ADOBE_FONTS_KIT_ID;

if (adobeFontsKitId && !document.querySelector(`link[data-adobe-kit="${adobeFontsKitId}"]`)) {
  const adobeFontsLink = document.createElement('link');
  adobeFontsLink.rel = 'stylesheet';
  adobeFontsLink.href = `https://use.typekit.net/${adobeFontsKitId}.css`;
  adobeFontsLink.setAttribute('data-adobe-kit', adobeFontsKitId);
  document.head.appendChild(adobeFontsLink);
}

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
  </React.StrictMode>,
);
