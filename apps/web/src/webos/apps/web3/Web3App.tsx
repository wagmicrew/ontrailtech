// Web3App — re-exports the existing Web3Page which manages token minting, contracts, chains, ConnectKit and RunnerCoin.
// The internal adminFetch is scoped to that page; a future refactor can migrate it to ../../core/admin-fetch.
export { default } from '../../../pages/admin/Web3Page';
