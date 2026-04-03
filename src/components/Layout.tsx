import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  FileText, 
  BarChart3, 
  LogOut, 
  Menu, 
  X,
  Sun,
  Moon,
  UserCircle,
  ShoppingCart,
  MapPin,
  Settings
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { Button } from './ui';
import { cn } from '../lib/utils';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Invoices', path: '/invoices', icon: FileText },
    { name: 'Purchases', path: '/purchases', icon: ShoppingCart },
    { name: 'Routes', path: '/routes', icon: MapPin },
    { name: 'Customers', path: '/customers', icon: Users },
    { name: 'Items', path: '/items', icon: Package },
    { name: 'Reports', path: '/reports', icon: BarChart3 },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className={cn("min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200", isDarkMode && "dark")}>
      {/* Sidebar for Desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center border-b border-gray-200 px-6 dark:border-gray-800">
            <Link to="/" className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400">
              <Package className="h-6 w-6" />
              <span className="text-xl">ProInvoice</span>
            </Link>
          </div>
          
          <nav className="flex-1 space-y-1 px-4 py-4">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  location.pathname === item.path
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="border-t border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center gap-3 px-2 py-2">
              <UserCircle className="h-8 w-8 text-gray-400" />
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {profile?.displayName}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {profile?.role}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              className="mt-2 w-full justify-start gap-3 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Header for Mobile */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900 lg:hidden">
        <Link to="/" className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400">
          <Package className="h-6 w-6" />
          <span className="text-lg">ProInvoice</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggleDarkMode}>
            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu className="h-6 w-6" />
          </Button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-900">
            <div className="flex h-16 items-center justify-between border-b border-gray-200 px-6 dark:border-gray-800">
              <span className="font-bold text-blue-600 dark:text-blue-400">ProInvoice</span>
              <Button variant="ghost" size="sm" onClick={() => setIsMobileMenuOpen(false)}>
                <X className="h-6 w-6" />
              </Button>
            </div>
            <nav className="space-y-1 px-4 py-4">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    location.pathname === item.path
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              ))}
              <Button
                variant="ghost"
                className="mt-4 w-full justify-start gap-3 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5" />
                Logout
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {navItems.find(item => item.path === location.pathname)?.name || 'Dashboard'}
            </h1>
            <div className="hidden lg:block">
              <Button variant="ghost" size="sm" onClick={toggleDarkMode}>
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
};
