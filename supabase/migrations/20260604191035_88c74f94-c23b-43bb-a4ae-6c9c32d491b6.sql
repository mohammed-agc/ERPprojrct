
-- Add 'purchase' to vehicle_cost_type enum first (must be its own statement)
ALTER TYPE public.vehicle_cost_type ADD VALUE IF NOT EXISTS 'purchase';
