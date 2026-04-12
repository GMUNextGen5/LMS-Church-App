/**
 * Replaces `[data-lucide="…"]` placeholders with SVG (subset import for smaller bundles).
 */
import { createIcons } from 'lucide';
import {
  AlertTriangle,
  ChevronRight,
  Info,
  RefreshCw,
  Search,
  Users,
} from 'lucide';

const LMS_LUCIDE_ICONS = {
  AlertTriangle,
  ChevronRight,
  Info,
  RefreshCw,
  Search,
  Users,
};

export function hydrateLmsLucideIcons(root: Document | Element = document): void {
  createIcons({
    icons: LMS_LUCIDE_ICONS,
    attrs: { 'stroke-width': 1.5 },
    root,
  });
}
