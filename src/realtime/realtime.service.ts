import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Point d'émission temps réel (Socket.IO, namespace /chat).
 * Chaque socket authentifié rejoint la room `user:<id>` ; les rooms `job:<id>`
 * sont rejointes à la demande (écran de chat).
 * Le serveur est fourni par ChatGateway à l'initialisation ; avant cela, les
 * émissions sont simplement ignorées (ex. scripts, tests).
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: Server;

  attach(server: Server) {
    this.server = server;
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toUsers(userIds: string[], event: string, payload: unknown) {
    const rooms = [...new Set(userIds)].map((id) => `user:${id}`);
    if (rooms.length) this.server?.to(rooms).emit(event, payload);
  }

  /** Utilisateurs + chat du job en un seul envoi (un socket présent dans plusieurs rooms ne reçoit qu'une fois). */
  toUsersAndJob(userIds: string[], jobId: string, event: string, payload: unknown) {
    const rooms = [...new Set(userIds)].map((id) => `user:${id}`).concat(`job:${jobId}`);
    this.server?.to(rooms).emit(event, payload);
  }

  toJob(jobId: string, event: string, payload: unknown) {
    this.server?.to(`job:${jobId}`).emit(event, payload);
  }
}
