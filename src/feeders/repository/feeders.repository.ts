import { BadRequestException, Injectable } from '@nestjs/common';
import { Feeder, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class FeederRepository {
    constructor(private readonly prisma: PrismaService) {}

    addFeeder(feeder: Prisma.FeederCreateInput): Promise<Feeder> {
        return this.prisma.feeder.create({ data: feeder });
    }

    updateFeeder(id: string, updateData: Partial<Feeder>): Promise<Feeder> {
        if (Object.keys(updateData).length === 0) {
            throw new BadRequestException('Update data cannot be empty');
        }

        console.log('Updating feeder with ID:', id, 'Update data:', updateData);
        return this.prisma.feeder.update({
            where: { id },
            data: updateData,
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

    findAll(): Promise<Feeder[]> {
        return this.prisma.feeder.findMany();
    }
}