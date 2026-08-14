export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  section: 'main' | 'system';
  mobileVisible: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', path: '/overview', icon: 'home', section: 'main', mobileVisible: true },
  { id: 'integrations', label: 'Integrations', path: '/integrations', icon: 'plug', section: 'main', mobileVisible: false },
  { id: 'workflows', label: 'Workflows', path: '/workflows', icon: 'workflow', section: 'main', mobileVisible: false },
  { id: 'activity', label: 'Activity', path: '/activity', icon: 'activity', section: 'main', mobileVisible: true },
  { id: 'tools', label: 'Tools', path: '/tools', icon: 'wrench', section: 'main', mobileVisible: false },
  { id: 'knowledge', label: 'Knowledge', path: '/knowledge', icon: 'brain', section: 'main', mobileVisible: false },
  { id: 'monitoring', label: 'Monitoring', path: '/monitoring', icon: 'chart', section: 'system', mobileVisible: true },
  { id: 'automations', label: 'Automations', path: '/automations', icon: 'clock', section: 'system', mobileVisible: false },
];

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter(item => item.mobileVisible);

export function getActiveNavItem(path: string): NavItem | undefined {
  return NAV_ITEMS.find(item => path.startsWith(item.path));
}

export function isDesktopOnly(path: string): boolean {
  const item = getActiveNavItem(path);
  return item ? !item.mobileVisible : false;
}
