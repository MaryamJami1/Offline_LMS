import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

interface RequestWithAddress {
  ip?: string;
  socket?: { remoteAddress?: string };
}

/**
 * The address of the PC that made the request, for the audit log. Behind Caddy
 * it is the address Caddy saw, because app.setup.ts trusts that one hop; see
 * docs/docs/06-security-and-data.md.
 */
export const ClientIp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<RequestWithAddress>();
    return request.ip ?? request.socket?.remoteAddress ?? '0.0.0.0';
  },
);
