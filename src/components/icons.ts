import {
  AppWindow, Server, Cog, Zap, Database, HardDrive, MemoryStick, RadioTower, ListOrdered, ShieldHalf, BrainCircuit, Globe2,
  Gauge, Shield, Layers, Wallet, MapPin, Rocket, type LucideIcon,
} from 'lucide-react';
import type { CapabilityKind, OverlayKind } from '../domain/types';
import type { Category } from '../domain/catalog';

export const KIND_ICON: Record<CapabilityKind, LucideIcon> = {
  web_app: AppWindow, api_service: Server, worker: Cog, function: Zap, postgres: Database, object_storage: HardDrive,
  cache: MemoryStick, event_bus: RadioTower, queue: ListOrdered, api_gateway: ShieldHalf, model_endpoint: BrainCircuit, external_system: Globe2,
};

export const CATEGORY_COLOR: Record<Category, string> = {
  Compute: '#4F46E5', Data: '#0F9D8A', Integration: '#D97706', AI: '#9333EA', External: '#64748B',
};

export const OVERLAY_ICON: Record<OverlayKind, LucideIcon> = {
  environment: Rocket, security: Shield, performance: Gauge, resilience: Layers, cost: Wallet, placement: MapPin,
};
