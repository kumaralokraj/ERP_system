import { useMemo } from 'react';
import { useAuth } from '../context/authContext/AuthContext';

const useHasPermission = (permission) => {
  const { hasPermission } = useAuth();

  return useMemo(() => hasPermission(permission), [hasPermission, permission]);
};

export default useHasPermission;
