import { KeyRound, ShieldCheck, Plus, User, type LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  to: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "vault", label: "Vault", description: "Your one-time codes", icon: KeyRound, to: "/vault" },
  { id: "security", label: "Security", description: "Passphrase & lock", icon: ShieldCheck, to: "/security" },
  { id: "add", label: "Add account", description: "Scan or enter manually", icon: Plus, to: "/vault/new" },
  { id: "profile", label: "Profile", description: "Name, avatar, email", icon: User, to: "/profile" },
];
