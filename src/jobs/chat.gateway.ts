import { Logger, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { MessagesService } from './messages.service';

interface AuthedSocket extends Socket {
  data: { userId?: string; userType?: 'CLIENT' | 'PRO' | 'ADMIN'; rooms?: Set<string> };
}

interface AccessTokenPayload {
  sub: string;
  userType: 'CLIENT' | 'PRO' | 'ADMIN';
}

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  // Note : Path configurable via WS_PATH, mais on garde la valeur par défaut /socket.io
  namespace: '/chat',
})
@UseFilters()
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
  ) {}

  afterInit() {
    this.logger.log('ChatGateway initialisé (namespace /chat)');
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) throw new WsException('Token manquant');

      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.data.userId = payload.sub;
      client.data.userType = payload.userType;
      client.data.rooms = new Set();
      this.logger.debug(`socket connected user=${payload.sub} sid=${client.id}`);
    } catch (e) {
      this.logger.warn(`socket reject: ${(e as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    this.logger.debug(`socket disconnected sid=${client.id}`);
  }

  @SubscribeMessage('job:join')
  async joinJob(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { jobId: string },
  ) {
    if (!client.data.userId) throw new WsException('Non authentifié');
    await this.messages.assertParticipant(payload.jobId, {
      id: client.data.userId,
      email: '',
      userType: client.data.userType ?? 'CLIENT',
    });
    const room = `job:${payload.jobId}`;
    await client.join(room);
    client.data.rooms?.add(room);
    return { joined: payload.jobId };
  }

  @SubscribeMessage('job:leave')
  async leaveJob(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { jobId: string },
  ) {
    const room = `job:${payload.jobId}`;
    await client.leave(room);
    client.data.rooms?.delete(room);
    return { left: payload.jobId };
  }

  @SubscribeMessage('typing')
  typing(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { jobId: string; typing: boolean },
  ) {
    if (!client.data.userId) return;
    client.to(`job:${payload.jobId}`).emit('typing', {
      userId: client.data.userId,
      typing: payload.typing,
    });
  }

  /**
   * Diffuse un évènement à tous les sockets dans une room de job.
   * Appelé par MessagesController après persistance d'un message.
   */
  broadcastToJob(jobId: string, event: string, payload: unknown) {
    this.server.to(`job:${jobId}`).emit(event, payload);
  }
}
