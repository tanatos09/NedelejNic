import React, { useState } from 'react';
import { AdminLayout } from '../components/admin/AdminLayout';
import { UsersPage } from './UsersPage';
import { LevelControlPage } from './LevelControlPage';
import { DevToolsPage } from './DevToolsPage';

interface AdminDashboardProps {
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [currentPage, setCurrentPage] = useState<'users' | 'levels' | 'devtools'>('users');

  const handleNavigation = (page: 'users' | 'levels' | 'devtools' | 'game') => {
    if (page === 'game') {
      onBack();
    } else {
      setCurrentPage(page);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'users':
        return <UsersPage />;
      case 'levels':
        return <LevelControlPage />;
      case 'devtools':
        return <DevToolsPage />;
      default:
        return <UsersPage />;
    }
  };

  return (
    <AdminLayout currentPage={currentPage} onNavigation={handleNavigation}>
      {renderPage()}
    </AdminLayout>
  );
};
