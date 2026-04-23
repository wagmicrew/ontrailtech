import { lazy } from 'react';

export interface AppDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  permissions: string[];
  defaultWidth: number;
  defaultHeight: number;
  /** Override the global contentPadding for this app's window content area */
  windowPadding?: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}

export const APP_REGISTRY: AppDefinition[] = [
  {
    id: 'users',
    name: 'Users',
    icon: '👥',
    description: 'Manage users, roles, and sessions',
    permissions: ['users.read', 'users.write'],
    defaultWidth: 1100,
    defaultHeight: 700,
    component: lazy(() => import('../apps/users/UsersApp')),
  },
  {
    id: 'database',
    name: 'Database',
    icon: '🗄',
    description: 'Browse tables and run SQL queries',
    permissions: ['database.read', 'database.write'],
    defaultWidth: 1200,
    defaultHeight: 720,
    component: lazy(() => import('../apps/database/DatabaseApp')),
  },
  {
    id: 'fitness',
    name: 'Fitness',
    icon: '⚡',
    description: 'Fitness integrations and provider config',
    permissions: ['fitness.read', 'fitness.write'],
    defaultWidth: 1000,
    defaultHeight: 700,
    component: lazy(() => import('../apps/fitness/FitnessApp')),
  },
  {
    id: 'expo',
    name: 'Expo Go',
    icon: '📱',
    description: 'Mobile development server management',
    permissions: ['expo.read', 'expo.write'],
    defaultWidth: 1100,
    defaultHeight: 740,
    component: lazy(() => import('../apps/expo/ExpoApp')),
  },
  {
    id: 'trail-lab',
    name: 'Trail Lab',
    icon: '🗺',
    description: 'OSM map editor and trail management',
    permissions: ['trails.read', 'trails.write'],
    defaultWidth: 1300,
    defaultHeight: 800,
    windowPadding: '0px',
    component: lazy(() => import('../apps/trail-lab/TrailLabApp')),
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    icon: '⚗',
    description: 'Alchemy API, NFT, Chains, Contracts, Access, Site Wallet, ConnectKit, Runner Coin, Mint, Token Portfolio',
    permissions: ['web3.read', 'web3.write'],
    defaultWidth: 1100,
    defaultHeight: 700,
    component: lazy(() => import('../apps/alchemy/AlchemyApp')),
  },
  {
    id: 'bonding-sim',
    name: 'Curve Sim',
    icon: '📈',
    description: 'Bonding curve algorithm simulator — compare linear, exponential, sigmoid, pump.fun',
    permissions: ['web3.read'],
    defaultWidth: 1000,
    defaultHeight: 680,
    component: lazy(() => import('../apps/bonding-sim/BondingSimApp')),
  },
  {
    id: 'runner-bonding',
    name: 'Runner Bonding',
    icon: '🪙',
    description: 'Trade runner shares on a quadratic bonding curve — buy, sell, TGE pipeline',
    permissions: ['web3.read', 'web3.write'],
    defaultWidth: 1100,
    defaultHeight: 720,
    component: lazy(() => import('../apps/runner-bonding/RunnerBondingApp')),
  },
  {
    id: 'friend-fi',
    name: 'Friend-Fi',
    icon: '🤝',
    description: 'Buy FriendPasses for runners — early access, reputation boosts, exclusive content',
    permissions: ['web3.read', 'web3.write'],
    defaultWidth: 1050,
    defaultHeight: 700,
    component: lazy(() => import('../apps/friend-fi/FriendFiApp')),
  },
  {
    id: 'poi-fi',
    name: 'POI-Fi',
    icon: '📍',
    description: 'Earn passive income from your POIs — check-in rewards and NFT marketplace',
    permissions: ['trails.read', 'trails.write', 'web3.write'],
    defaultWidth: 1050,
    defaultHeight: 700,
    component: lazy(() => import('../apps/poi-fi/PoiFiApp')),
  },
  {
    id: 'runner-profile',
    name: 'Runner Profile',
    icon: '👤',
    description: 'View runner tokenomics, POIs, routes, FriendPass details and TGE progress',
    permissions: [],
    defaultWidth: 1100,
    defaultHeight: 760,
    component: lazy(() => import('../apps/runner-profile/RunnerProfileApp')),
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: '⚙',
    description: 'System appearance and preferences',
    permissions: [],
    defaultWidth: 800,
    defaultHeight: 560,
    component: lazy(() => import('../apps/settings/SettingsApp')),
  },
  {
    id: 'monitor',
    name: 'System Monitor',
    icon: '📊',
    description: 'Running processes and system logs',
    permissions: ['kernel.read'],
    defaultWidth: 900,
    defaultHeight: 600,
    component: lazy(() => import('../apps/monitor/SystemMonitorApp')),
  },
];

export function getApp(id: string): AppDefinition | undefined {
  return APP_REGISTRY.find(a => a.id === id);
}
