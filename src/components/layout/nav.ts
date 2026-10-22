import { CalendarClock, ChartColumn, FileUp, LayoutDashboard, Library, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { to: '/sets', label: 'My Study Sets', short: 'Sets', icon: Library },
  { to: '/upload', label: 'Upload PDF', short: 'Upload', icon: FileUp },
  { to: '/review', label: 'Review Due', short: 'Review', icon: CalendarClock },
  { to: '/progress', label: 'Progress', short: 'Progress', icon: ChartColumn },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings },
];
