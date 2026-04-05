import axios, { AxiosInstance, AxiosError } from 'axios';

const baseURL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config) => {
    // Add correlation ID for tracing
    config.headers['X-Correlation-ID'] = `req-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`;

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle specific error cases
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data as any;

      switch (status) {
        case 401:
          console.error('Unauthorized - token may be expired');
          // Could trigger logout here
          break;
        case 403:
          console.error('Forbidden - insufficient permissions');
          break;
        case 404:
          console.error('Resource not found');
          break;
        case 429:
          console.error('Rate limit exceeded');
          break;
        case 500:
        case 502:
        case 503:
          console.error('Server error');
          break;
        default:
          console.error(`API error: ${status}`);
      }

      return Promise.reject({
        status,
        message: data?.message || error.message,
        error: data?.error,
      });
    } else if (error.request) {
      // Request made but no response
      console.error('Network error - no response received');
      return Promise.reject({
        status: 0,
        message: 'Network error - please check your connection',
      });
    } else {
      // Something else happened
      console.error('Request error:', error.message);
      return Promise.reject({
        status: 0,
        message: error.message,
      });
    }
  }
);

// Helper function to set auth token
export function setAuthToken(token: string | null): void {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
}

export default apiClient;
