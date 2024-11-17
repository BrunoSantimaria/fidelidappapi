class EventService {
  constructor() {
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect(accountId, token) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(`/api/events/${accountId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.eventSource.onopen = () => {
      console.log("Conexión SSE establecida");
      this.reconnectAttempts = 0;
    };

    this.eventSource.onerror = (error) => {
      console.error("Error SSE:", error);
      this.handleReconnection();
    };
  }

  handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.connect(), 5000 * this.reconnectAttempts);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

export default new EventService();
