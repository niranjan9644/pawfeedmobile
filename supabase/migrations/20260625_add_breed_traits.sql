-- Migration: Add breed_traits column to pets table
ALTER TABLE pets ADD COLUMN IF NOT EXISTS breed_traits JSONB;
