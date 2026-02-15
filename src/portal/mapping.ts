import { Config } from '../config'

const defaultChainToDataset: Record<string, string> = {
  '1': 'ethereum-mainnet',
  '10': 'optimism-mainnet',
  '56': 'binance-mainnet',
  '100': 'gnosis-mainnet',
  '137': 'polygon-mainnet',
  '250': 'fantom-mainnet',
  '324': 'zksync-mainnet',
  '8453': 'base-mainnet',
  '42161': 'arbitrum-one',
  '42170': 'arbitrum-nova',
  '43114': 'avalanche-mainnet',
  '59144': 'linea-mainnet',
  '534352': 'scroll-mainnet',
  '81457': 'blast-mainnet',
  '7777777': 'zora-mainnet',
  '11155111': 'ethereum-sepolia',
  '84532': 'base-sepolia',
  '421614': 'arbitrum-sepolia',
  '11155420': 'optimism-sepolia',
}

export function resolveDataset(chainId: number, config: Config): string | null {
  const key = String(chainId)
  if (config.portalDatasetMap[key]) {
    return config.portalDatasetMap[key]
  }
  if (config.portalUseDefaultDatasets && defaultChainToDataset[key]) {
    return defaultChainToDataset[key]
  }
  return null
}

export function supportedChainIds(): number[] {
  return Object.keys(defaultChainToDataset).map((v) => Number(v))
}

export function defaultDatasetMap(): Record<string, string> {
  return { ...defaultChainToDataset }
}
