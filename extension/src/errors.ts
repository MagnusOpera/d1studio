import { CloudflareApiError } from './cloudflareClient.js';

export function errorMessage(error: unknown): string {
  if (error instanceof CloudflareApiError) {
    switch (error.kind) {
      case 'authentication':
        return 'Cloudflare rejected the API token. Configure a valid D1 Read or D1 Edit token.';
      case 'account':
        return 'The Cloudflare account ID was not found or is not accessible by this token.';
      case 'write-permission':
        return error.message;
      case 'permission':
        return `Cloudflare denied this operation: ${error.message}`;
      case 'rate-limit':
        return 'Cloudflare API rate limit reached. Wait briefly, then retry.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
