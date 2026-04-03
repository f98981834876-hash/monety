import { IdealaneDB } from '@idealane/node-sdk';

export const db = new IdealaneDB({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false }
});

export const isDbReady = (): boolean => !!process.env.DATABASE_URL;
