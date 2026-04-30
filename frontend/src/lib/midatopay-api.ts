// API service para MidatoPay
class MidatoPayAPI {
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  }

  private async request(endpoint: string, options: RequestInit = {}, bearerOverride?: string | null) {
    const token = bearerOverride !== undefined && bearerOverride !== null
      ? bearerOverride
      : this.getAuthToken();

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error en la solicitud');
    }

    return response.json();
  }

  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        return parsed.state?.token || null;
      }
    } catch (error) {
      console.error('Error getting auth token:', error);
    }
    
    return null;
  }

  // Generar QR (opcional: bearer de Clerk vía getToken() si no hay JWT en localStorage)
  async generatePaymentQR(
    data: {
      amountARS: number;
      targetCrypto: string;
      network?: string;
      concept?: string;
    },
    bearerToken?: string | null
  ) {
    return this.request(
      '/api/midatopay/generate-qr',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      bearerToken
    );
  }

  async getPaymentHistory(limit: number = 50, bearerToken?: string | null) {
    return this.request(`/api/midatopay/payment-history?limit=${limit}`, {}, bearerToken);
  }

  async getMerchantStats(bearerToken?: string | null) {
    return this.request('/api/midatopay/stats', {}, bearerToken);
  }

  /** Balance USDC + tasa CriptoYa (dashboard) */
  async getMerchantCryptoOverview(bearerToken?: string | null) {
    return this.request('/api/oracle/merchant-crypto-overview', {}, bearerToken);
  }

  // Escanear QR
  async scanQR(qrData: string) {
    return this.request('/api/midatopay/scan-qr', {
      method: 'POST',
      body: JSON.stringify({ qrData }),
    });
  }

  // Obtener información de sesión
  async getPaymentSession(sessionId: string) {
    return this.request(`/api/midatopay/session/${sessionId}`);
  }
}

export const midatoPayAPI = new MidatoPayAPI();
