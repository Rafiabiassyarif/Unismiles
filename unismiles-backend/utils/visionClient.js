const visionServiceUrl = process.env.PAYMENT_VISION_SERVICE_URL || 'http://localhost:5001';
const visionServiceToken = process.env.PAYMENT_VISION_SERVICE_TOKEN || 'local-secret';

const VisionClient = {
  /**
   * Send frame buffers to the payment-vision-service for processing
   * @param {Buffer[]} frames - Array of frame buffers
   * @param {string} challengeId - Liveness challenge identifier
   * @returns {Promise<object>} Parsed OCR and classification results
   */
  async processFrames(frames, challengeId, expectedAmount) {
    const formData = new FormData();
    formData.append('challenge_id', challengeId);
    if (expectedAmount) {
      formData.append('expected_amount', String(expectedAmount));
    }

    frames.forEach((frame, idx) => {
      // Convert Node Buffer to standard Blob/File for FormData
      const blob = new Blob([frame], { type: 'image/jpeg' });
      formData.append('files', blob, `frame_${idx}.jpg`);
    });

    console.log(`[VisionClient] Sending ${frames.length} frames to ${visionServiceUrl}/process`);

    const response = await fetch(`${visionServiceUrl}/process`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${visionServiceToken}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision service returned status ${response.status}: ${errorText}`);
    }

    return response.json();
  }
};

module.exports = VisionClient;
