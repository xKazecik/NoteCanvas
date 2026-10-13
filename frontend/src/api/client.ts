import axios from "axios";
import { isNetworkError, markServerReachable } from "../offline/offlineState";

export const API_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Offline mode needs to know whether the server can be reached right now: an
// app response proves it can; no response (or a gateway error) says it can't.
api.interceptors.response.use(
  (response) => {
    markServerReachable(true);
    return response;
  },
  (error) => {
    if (isNetworkError(error)) markServerReachable(false);
    else if (axios.isAxiosError(error)) markServerReachable(true);
    return Promise.reject(error);
  },
);

export { default as axios } from "axios";
export const isAxiosError = axios.isAxiosError;
