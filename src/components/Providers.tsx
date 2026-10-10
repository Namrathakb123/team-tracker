'use client'

import { AuthProvider } from '../context/AuthContext';
import { DataProvider } from '../context/DataContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DataProvider>
        {children}
      </DataProvider>
    </AuthProvider>
  );
}
