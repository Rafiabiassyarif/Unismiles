# OCR service for payment-proof scanning.
#
# Why this exists: the FastAPI service (payment-vision-service/main.py) could not
# load any OCR engine on the production NAS — pytesseract needs a `tesseract`
# binary that is not installed and cannot be apt-installed without root, and
# PaddleOCR was never installed. With no engine the OCR stage was skipped,
# `amount` stayed null, and matching a nominal was impossible, so every scan
# failed even when the receipt was perfectly readable.
#
# This image runs the tesseract.js implementation (server.js/ocr.js/preprocess.js
# in this folder), which needs only npm — no system packages. Measured against a
# production-sized receipt: 'Nominal Rp 5.068' -> amount 5068.
#
# It is run as a plain container, outside the site pipeline, so deploys cannot
# wipe it:
#   docker build -t unismiles-ocr:1 payment-vision-node
#   docker run -d --name unismiles-ocr --restart unless-stopped \
#     --network host -e PORT=5070 -e PAYMENT_VISION_SERVICE_TOKEN=<token> unismiles-ocr:1
#
# Backend points at it with PAYMENT_VISION_SERVICE_URL=http://<host>:5070.
# --network host is required: with a bridged network the port was reachable on
# loopback only and the backend jail could not connect.
FROM node:22.19-alpine

WORKDIR /app

ENV TESSDATA_PREFIX=/app/tessdata
RUN mkdir -p /app/tessdata

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ocr.js preprocess.js ./

EXPOSE 5070
CMD ["node", "server.js"]
