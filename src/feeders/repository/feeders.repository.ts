import { BadRequestException, Injectable } from '@nestjs/common';
import { Feeder, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FeederState } from '../../shared/enums.js';

@Injectable()
export class FeederRepository {
    constructor(private readonly prisma: PrismaService) {}

    addFeeder(feeder: Prisma.FeederCreateInput): Promise<Feeder> {
        return this.prisma.feeder.create({ data: feeder });
    }

    updateFeeder(id: string, actualState: FeederState): Promise<Feeder> {
        if (!actualState) {
            throw new BadRequestException('Update data cannot be empty');
        }

        return this.prisma.feeder.update({
            where: { id },
            data: {actualState, desiredState: actualState},
        });
    }

    removeFeeder(id: string): Promise<Feeder> {
        return this.prisma.feeder.delete({
            where: { id },
        });
    }

    findById(id: string): Promise<Feeder | null> {
        return this.prisma.feeder.findUnique({
            where: { id },
        });
    }

    findManyByUserId(userId: string): Promise<Feeder[]> {
        return this.prisma.feeder.findMany({
            where: { userFeeders: { some: { userId } } },
        });
    }

    findAll(): Promise<Feeder[]> {
        return this.prisma.feeder.findMany();
    }
}