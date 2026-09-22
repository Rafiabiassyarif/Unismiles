export interface KioskAgentState {
  maintenanceMode: boolean;
  brightness: number;
  volume: number;
  resolution: string;
  paperSize: string;
  allowedLayouts?: string[];
  /**
   * Penyesuaian tampilan foto hasil cetak + kalibrasi termal, diatur dari
   * halaman Pengaturan Admin. Photobooth-lah yang menggambar hasil akhir, jadi
   * nilai ini dipakai di sini — bukan di agent.
   *
   * CATATAN: ini untuk FOTO HASIL, bukan frame yang dikirim ke OCR verifikasi
   * pembayaran. Jalur OCR punya filter sendiri yang sudah dikalibrasi supaya
   * nominal struk terbaca; mengubahnya akan merusak verifikasi pembayaran.
   */
  photoBrightness?: number;
  photoContrast?: number;
  photoSaturation?: number;
  thermalDensity?: number;
  thermalOffsetYPx?: number;
  photoFitMode?: 'fit' | 'stretch';
}

type StateCallback = (state: KioskAgentState) => void;

class KioskAgentBridge {
  private socket: WebSocket | null = null;
  private listeners: Set<StateCallback> = new Set();
  private reconnectTimer: any = null;
  private enabled = String(import.meta.env.VITE_ENABLE_LOCAL_KIOSK_BRIDGE || 'false').toLowerCase() === 'true';
  private currentPort = Number(import.meta.env.VITE_LOCAL_BRIDGE_PORT) || 3011;

  public currentState: KioskAgentState = {
    maintenanceMode: false,
    brightness: 80,
    volume: 100,
    resolution: '1080x1920',
    paperSize: '4R',
    // Netral sampai agent melaporkan nilai dari Admin.
    photoBrightness: 100,
    photoContrast: 100,
    photoSaturation: 100,
    thermalDensity: 3,
    thermalOffsetYPx: 0,
    photoFitMode: 'fit',
  };

  constructor() {
    if (!this.enabled) return;
    this.connect();
    this.pollFallback();
  }

  public subscribe(callback: StateCallback): () => void {
    this.listeners.add(callback);
    callback(this.currentState); // Immediate state emit
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.currentState));
  }

  private connect() {
    try {
      this.socket = new WebSocket(`ws://localhost:${this.currentPort}`);

      this.socket.onopen = () => {
        console.log('[KioskAgentBridge] Connected to Local Kiosk Agent service.');
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'INITIAL_STATE' || data.type === 'STATE_UPDATE') {
            this.currentState = { ...this.currentState, ...data.payload };
            this.notify();
          }
        } catch (e) {
          // ignore non-json messages
        }
      };

      this.socket.onclose = () => {
        this.scheduleReconnect();
      };

      this.socket.onerror = () => {
        if (this.socket) {
          this.socket.close();
        }
      };
    } catch (e) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  private pollFallback() {
    setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${this.currentPort}/api/kiosk-status`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            // Check if any relevant field changed, especially paperSize
            if (
              json.data.maintenanceMode !== this.currentState.maintenanceMode ||
              json.data.paperSize !== this.currentState.paperSize
            ) {
              this.currentState = { ...this.currentState, ...json.data };
              this.notify();
            }
          }
        }
      } catch (e) {
        // Agent offline or loading
      }
    }, 10000);
  }
}

export const kioskAgentBridge = new KioskAgentBridge();
