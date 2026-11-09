import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  it('expõe os modelos do schema inicial', () => {
    const prisma = new PrismaService();

    expect(prisma.usuario).toBeDefined();
    expect(prisma.processo).toBeDefined();
    expect(prisma.estagiario).toBeDefined();
  });
});
