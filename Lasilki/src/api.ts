// طبقة REST API + تخزين الجلسة (الرمز، المستخدم، عنوان السيرفر)
import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_SERVER} from './config';

export type User = {id: number; username: string; displayName: string};
export type Channel = {
  id: number;
  name: string;
  description: string;
  members: number;
  online: number;
  joined: boolean;
};
export type Message = {
  id: number;
  userId: number;
  username: string;
  file: string;
  durationMs: number;
  createdAt: number;
};
export type Member = {
  id: number;
  username: string;
  displayName: string;
  online: boolean;
};

let serverUrl = DEFAULT_SERVER;
let token = '';
let currentUser: User | null = null;

export async function loadSession() {
  serverUrl = (await AsyncStorage.getItem('serverUrl')) || DEFAULT_SERVER;
  token = (await AsyncStorage.getItem('token')) || '';
  const u = await AsyncStorage.getItem('user');
  currentUser = u ? JSON.parse(u) : null;
  return {serverUrl, token, user: currentUser};
}

export const getServerUrl = () => serverUrl;
export const getToken = () => token;
export const getUser = () => currentUser;

export async function setServerUrl(u: string) {
  serverUrl = u.trim().replace(/\/+$/, '');
  await AsyncStorage.setItem('serverUrl', serverUrl);
}

async function saveAuth(t: string, u: User) {
  token = t;
  currentUser = u;
  await AsyncStorage.setItem('token', t);
  await AsyncStorage.setItem('user', JSON.stringify(u));
}

export async function logout() {
  token = '';
  currentUser = null;
  await AsyncStorage.multiRemove(['token', 'user']);
}

async function apiFetch(path: string, options: {method?: string; body?: any; auth?: boolean} = {}) {
  const {method = 'GET', body, auth = true} = options;
  const res = await fetch(serverUrl + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? {Authorization: 'Bearer ' + token} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خطأ في الاتصال');
  return data;
}

export async function register(username: string, password: string, displayName: string) {
  const data = await apiFetch('/api/register', {
    method: 'POST',
    body: {username, password, displayName},
    auth: false,
  });
  await saveAuth(data.token, data.user);
  return data.user as User;
}

export async function login(username: string, password: string) {
  const data = await apiFetch('/api/login', {
    method: 'POST',
    body: {username, password},
    auth: false,
  });
  await saveAuth(data.token, data.user);
  return data.user as User;
}

export async function verifyToken(): Promise<User | null> {
  if (!token) return null;
  try {
    const data = await apiFetch('/api/me');
    currentUser = data.user;
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    return data.user as User;
  } catch {
    return null;
  }
}

export async function listChannels(): Promise<Channel[]> {
  const data = await apiFetch('/api/channels');
  return data.channels;
}

export async function createChannel(name: string, description: string): Promise<Channel> {
  const data = await apiFetch('/api/channels', {method: 'POST', body: {name, description}});
  return data.channel;
}

export async function joinChannel(id: number) {
  return apiFetch(`/api/channels/${id}/join`, {method: 'POST'});
}

export async function leaveChannel(id: number) {
  return apiFetch(`/api/channels/${id}/leave`, {method: 'POST'});
}

export async function getHistory(id: number): Promise<Message[]> {
  const data = await apiFetch(`/api/channels/${id}/history`);
  return data.messages;
}

export async function getMembers(id: number): Promise<Member[]> {
  const data = await apiFetch(`/api/channels/${id}/members`);
  return data.members;
}

// رابط ملف صوتي للسجل (مع الرمز للمصادقة)
export function audioUrl(file: string) {
  return `${serverUrl}/uploads/${file}?token=${encodeURIComponent(token)}`;
}
