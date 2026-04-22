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
    id: 'web3',
    name: 'Web3',
    icon: '⛓',
    description: 'Token minting, contracts, and chains',
    permissions: ['web3.read', 'web3.write'],
    defaultWidth: 1100,
    defaultHeight: 700,
    component: lazy(() => import('../apps/web3/Web3App')),
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
    description: 'Alchemy API keys, NFT lookup, chains, contract ABI publisher, and NFT access control',
    permissions: ['web3.read', 'web3.write'],
    defaultWidth: 1100,
    defaultHeight: 700,
    component: lazy(() => import('../apps/alchemy/AlchemyApp')),
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
