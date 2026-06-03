import {createContext, useContext} from 'react';
import {User} from './api';

export const AuthContext = createContext<{
  user: User | null;
  signIn: (u: User) => void;
  signOut: () => void;
}>({
  user: null,
  signIn: () => {},
  signOut: () => {},
});

export const useAuth = () => useContext(AuthContext);
