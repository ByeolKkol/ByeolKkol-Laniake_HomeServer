const STORAGE_KEY = 'server_ip';
const DEFAULT_IP = '192.168.1.8';
const DISCUSSION_HOST_KEY = 'discussion_host';

export function getServerIp(): string {
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_IP;
}

export function setServerIp(ip: string): void {
  localStorage.setItem(STORAGE_KEY, ip);
}

export function getApiBase(): string {
  return `http://${getServerIp()}:8000`;
}

export function getServerApiBase(): string {
  return `http://${getServerIp()}:8090`;
}

export function getWolApiBase(): string {
  return `http://${getServerIp()}:8091`;
}

export function getDiscussionHost(): string {
  return localStorage.getItem(DISCUSSION_HOST_KEY) ?? `${getServerIp()}:8092`;
}

export function setDiscussionHost(host: string): void {
  localStorage.setItem(DISCUSSION_HOST_KEY, host);
}

export function getDiscussionWsBase(): string {
  return `ws://${getDiscussionHost()}/ws/discuss`;
}

export function getIotApiBase(): string {
  return `http://${getServerIp()}:8093`;
}

export function getTapoApiBase(): string {
  return `http://${getServerIp()}:8094`;
}

export function getHealthApiBase(): string {
  return `http://${getServerIp()}:8095`;
}
