import { createContext, useContext } from 'react';

const NotificationContext = createContext();

export const useNotifier = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifier must be used within NotificationProvider');
  }
  return context;
};

export default NotificationContext;
