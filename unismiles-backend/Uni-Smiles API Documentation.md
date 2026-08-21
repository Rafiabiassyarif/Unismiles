# Uni-Smiles API Documentation

This document serves as the strict architectural standard and single source of truth for integrating the **Frontend Kiosk Application** and the **Admin Dashboard Application** with the **Uni-Smiles Backend API Server**.

---

## Table of Contents
1. [Overview & Base URL](#1-overview--base-url)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [System & Health Check](#3-system--health-check)
4. [Authentication Endpoints](#4-authentication-endpoints)
5. [User Management Endpoints](#5-user-management-endpoints)
6. [Kiosk Operations Endpoints](#6-kiosk-operations-endpoints)
7. [Frame Templates Endpoints](#7-frame-templates-endpoints)
8. [Session & Transactions Endpoints](#8-session--transactions-endpoints)
9. [Media & Assets Endpoints](#9-media--assets-endpoints)
10. [Analytics & Logs Endpoints](#10-analytics--logs-endpoints)
11. [Error Handling & Status Codes](#11-error-handling--status-codes)

---

## 1. Overview & Base URL

The Uni-Smiles Backend API is built on **Node.js**, **Express**, and **MySQL** (`mysql2/promise`). It communicates over HTTP via RESTful endpoints using standard JSON payloads and multipart form-data for file uploads.

- **Base URL:** `http://localhost:8000`
- **Static Media Base URL:** `http://localhost:8000/uploads`
- **Allowed CORS Origins:** `http://localhost:3000` (Admin Dashboard) and `http://localhost:3001` (Kiosk App)

---

## 2. Authentication & Authorization

The Uni-Smiles Backend API supports two authentication and authorization mechanisms:

### 2.1 JWT Bearer Token (Admin & Operator Auth)
Used by the **Admin Dashboard** for administrative tasks. Clients must pass the JWT in the `Authorization` header using the `Bearer` schema:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.2 API Key (Machine-to-Machine Auth)
Used by the physical **Frontend Kiosks** for hardware and operations-facing routes. Kiosks must pass their unique secure API key in the `x-api-key` header:
```http
x-api-key: 64_character_hexadecimal_string_generated_on_kiosk_registration
```

| Authorization Mode | Header Required | Description |
| :--- | :--- | :--- |
| **No (Public)** | None | Accessible publicly by any client. |
| **Yes (JWT Bearer)** | `Authorization: Bearer <token>` | Restricted to authenticated administrators/operators. |
| **Yes (x-api-key)** | `x-api-key: <api_key>` | Restricted to physical hardware kiosks with matching active API keys. |

---

## 3. System & Health Check

### 3.1 Root Health Check
- **Endpoint & Method:** `GET http://localhost:8000/`
- **Description:** Verifies that the backend server is up and actively listening.
- **Primary Consumer:** Both (Kiosk & Admin Dashboard)
- **Authorization:** No (Public)
- **Postman Testing Steps:**
  1. Set method to `GET`.
  2. Enter URL: `http://localhost:8000/`.
  3. Click **Send**.
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Uni-Smiles Photobooth Backend API Server is running.",
    "version": "1.0.0"
  }
  ```

---

## 4. Authentication Endpoints

### 4.1 User Login
- **Endpoint & Method:** `POST http://localhost:8000/api/auth/login`
- **Description:** Authenticates a registered user or administrator using their email and password. Returns a signed JWT and user metadata.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Postman Testing Steps:**
  1. Set method to `POST`.
  2. Enter URL: `http://localhost:8000/api/auth/login`.
  3. Under **Headers**, add `Content-Type: application/json`.
  4. Under **Body**, select **raw** and **JSON**, then paste the payload below.
- **Request Payload:**
  ```json
  {
    "email": "admin@unismiles.com",
    "password": "SecurePassword123!"
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzIwOTkwMDAwfQ.abc123signature",
    "user": {
      "id": 1,
      "name": "Super Admin",
      "email": "admin@unismiles.com",
      "role": "admin",
      "partner_name": "Uni-Smiles HQ"
    }
  }
  ```

### 4.2 User Registration
- **Endpoint & Method:** `POST http://localhost:8000/api/auth/register`
- **Description:** Registers a new operator or administrator account with a hashed password.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Postman Testing Steps:**
  1. Set method to `POST`.
  2. Enter URL: `http://localhost:8000/api/auth/register`.
  3. Under **Headers**, add `Content-Type: application/json`.
  4. Under **Body**, select **raw** and **JSON**, then paste the payload below.
- **Request Payload:**
  ```json
  {
    "name": "Operator Kiosk A",
    "email": "operator.a@unismiles.com",
    "password": "OperatorPass2026!",
    "role": "operator",
    "partner_name": "Telkom University Branch"
  }
  ```
- **Expected Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "data": {
      "id": 2,
      "name": "Operator Kiosk A",
      "email": "operator.a@unismiles.com",
      "role": "operator",
      "partner_name": "Telkom University Branch"
    }
  }
  ```

### 4.3 Get Current User Profile (`Me`)
- **Endpoint & Method:** `GET http://localhost:8000/api/auth/me`
- **Description:** Validates and decodes the active administrator JWT.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** Yes (JWT Bearer Token)
- **Postman Testing Steps:**
  1. Set method to `GET`.
  2. Enter URL: `http://localhost:8000/api/auth/me`.
  3. Under **Authorization**, select **Bearer Token** and paste the login token.
  4. Click **Send**.
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "user": {
      "id": 1,
      "role": "admin",
      "partner_name": "Uni-Smiles HQ",
      "iat": 1720990000,
      "exp": 1721076400
    }
  }
  ```

---

## 5. User Management Endpoints

### 5.1 Retrieve All Users
- **Endpoint & Method:** `GET http://localhost:8000/api/users`
- **Description:** Retrieves all users from the system, excluding password hashes.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** Yes (JWT Bearer Token)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "count": 2,
    "data": [
      {
        "id": 1,
        "name": "Super Admin",
        "email": "admin@unismiles.com",
        "role": "admin",
        "partner_name": "Uni-Smiles HQ",
        "created_at": "2026-07-15T03:22:06.000Z"
      },
      {
        "id": 2,
        "name": "Operator Kiosk A",
        "email": "operator.a@unismiles.com",
        "role": "operator",
        "partner_name": "Telkom University Branch",
        "created_at": "2026-07-15T04:12:30.000Z"
      }
    ]
  }
  ```

### 5.2 Retrieve User by ID
- **Endpoint & Method:** `GET http://localhost:8000/api/users/:id`
- **Description:** Retrieves detailed user details by ID.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** Yes (JWT Bearer Token)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "id": 2,
      "name": "Operator Kiosk A",
      "email": "operator.a@unismiles.com",
      "role": "operator",
      "partner_name": "Telkom University Branch",
      "created_at": "2026-07-15T04:12:30.000Z"
    }
  }
  ```

### 5.3 Update User Details
- **Endpoint & Method:** `PUT http://localhost:8000/api/users/:id`
- **Description:** Updates the profile info for a specific user ID.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** Yes (JWT Bearer Token)
- **Request Payload:**
  ```json
  {
    "name": "Operator Kiosk A (Modified)",
    "email": "operator.a.new@unismiles.com",
    "role": "operator",
    "partner_name": "Telkom University Library Center"
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "User updated successfully.",
    "data": {
      "id": 2,
      "name": "Operator Kiosk A (Modified)",
      "email": "operator.a.new@unismiles.com",
      "role": "operator",
      "partner_name": "Telkom University Library Center",
      "created_at": "2026-07-15T04:12:30.000Z"
    }
  }
  ```

### 5.4 Delete User
- **Endpoint & Method:** `DELETE http://localhost:8000/api/users/:id`
- **Description:** Permanently deletes a user from the system.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** Yes (JWT Bearer Token)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "User with ID 2 deleted successfully."
  }
  ```

---

## 6. Kiosk Operations Endpoints

### 6.1 Retrieve All Kiosks
- **Endpoint & Method:** `GET http://localhost:8000/api/kiosks`
- **Description:** Retrieves the list of all registered photobooth kiosks.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "count": 2,
    "data": [
      {
        "id": "KSK-TLKM-01",
        "name": "Uni-Smiles Telkom University Main Library",
        "location": "Bandung, West Java",
        "user_id": 1,
        "api_key": "7b0d7747e923e59074b1e5a59635fa29087cf24f5a6b0c6198f24a1b0254cb11"
      }
    ]
  }
  ```

### 6.2 Retrieve Kiosk by ID
- **Endpoint & Method:** `GET http://localhost:8000/api/kiosks/:id`
- **Description:** Fetches detailed information for a specific kiosk ID.
- **Primary Consumer:** Both (Kiosk & Admin Dashboard)
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "id": "KSK-TLKM-01",
      "name": "Uni-Smiles Telkom University Main Library",
      "location": "Bandung, West Java",
      "user_id": 1
    }
  }
  ```

### 6.3 Create New Kiosk
- **Endpoint & Method:** `POST http://localhost:8000/api/kiosks`
- **Description:** Registers a new kiosk unit. Automatically generates a secure 64-character API Key (`api_key`) and associates the kiosk with the creator user.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** Yes (JWT Bearer Token)
- **Request Payload:**
  ```json
  {
    "id": "KSK-BDG-03",
    "name": "Uni-Smiles PVJ Mall Concourse",
    "location": "Paris Van Java, Bandung"
  }
  ```
- **Expected Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Kiosk created successfully.",
    "data": {
      "id": "KSK-BDG-03",
      "name": "Uni-Smiles PVJ Mall Concourse",
      "location": "Paris Van Java, Bandung",
      "user_id": 1,
      "api_key": "9a2f7c4e5d8a9b0c2e3f5b7a1d9e0f2c4b6a8d0e1f3a5b7c9d0e1f2a3b4c5d6e"
    }
  }
  ```

### 6.4 Update Kiosk Details
- **Endpoint & Method:** `PUT http://localhost:8000/api/kiosks/:id`
- **Description:** Updates the name and location attributes of an existing kiosk.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** Yes (JWT Bearer Token)
- **Request Payload:**
  ```json
  {
    "name": "Uni-Smiles PVJ Mall Floor 2",
    "location": "Bandung, PVJ Mall Glamour Level"
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Kiosk updated successfully.",
    "data": {
      "id": "KSK-BDG-03",
      "name": "Uni-Smiles PVJ Mall Floor 2",
      "location": "Bandung, PVJ Mall Glamour Level",
      "user_id": 1
    }
  }
  ```

### 6.5 Delete Kiosk
- **Endpoint & Method:** `DELETE http://localhost:8000/api/kiosks/:id`
- **Description:** Deletes a kiosk registration from the system database.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** Yes (JWT Bearer Token)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Kiosk with ID KSK-BDG-03 deleted successfully."
  }
  ```

---

## 7. Frame Templates Endpoints

### 7.1 Retrieve All Frame Templates
- **Endpoint & Method:** `GET http://localhost:8000/api/frame_templates`
- **Description:** Retrieves all available photobooth frame templates.
- **Primary Consumer:** Both (Kiosk & Admin Dashboard)
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "count": 2,
    "data": [
      {
        "id": 1,
        "name": "Retro Film Strip 3-Slot",
        "category": "Vintage",
        "image_url": "https://cdn.unismiles.com/frames/retro-strip-3.png",
        "slot_count": 3,
        "layout_config": {
          "orientation": "vertical",
          "slots": [
            { "index": 0, "x": 50, "y": 100, "width": 400, "height": 300 },
            { "index": 1, "x": 50, "y": 450, "width": 400, "height": 300 },
            { "index": 2, "x": 50, "y": 800, "width": 400, "height": 300 }
          ]
        }
      }
    ]
  }
  ```

### 7.2 Retrieve Frame Template by ID
- **Endpoint & Method:** `GET http://localhost:8000/api/frame_templates/:id`
- **Description:** Retrieves layout coordinates and specifications for a single template.
- **Primary Consumer:** Both (Kiosk & Admin Dashboard)
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "id": 1,
      "name": "Retro Film Strip 3-Slot",
      "category": "Vintage",
      "image_url": "https://cdn.unismiles.com/frames/retro-strip-3.png",
      "slot_count": 3,
      "layout_config": {
        "orientation": "vertical",
        "slots": [
          { "index": 0, "x": 50, "y": 100, "width": 400, "height": 300 }
        ]
      }
    }
  }
  ```

### 7.3 Create Frame Template
- **Endpoint & Method:** `POST http://localhost:8000/api/frame_templates`
- **Description:** Adds a new custom frame template design.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:**
  ```json
  {
    "name": "Graduation Special 2026",
    "category": "Seasonal",
    "image_url": "https://cdn.unismiles.com/frames/grad-2026.png",
    "slot_count": 2,
    "layout_config": {
      "orientation": "horizontal",
      "slots": [
        { "index": 0, "x": 100, "y": 150, "width": 500, "height": 650 }
      ]
    }
  }
  ```
- **Expected Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Frame template created successfully.",
    "data": {
      "id": 3,
      "name": "Graduation Special 2026",
      "category": "Seasonal",
      "image_url": "https://cdn.unismiles.com/frames/grad-2026.png",
      "slot_count": 2
    }
  }
  ```

### 7.4 Update Frame Template
- **Endpoint & Method:** `PUT http://localhost:8000/api/frame_templates/:id`
- **Description:** Updates the parameters of an existing template.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:**
  ```json
  {
    "name": "Graduation Special 2026 (Updated Gold)",
    "category": "Seasonal",
    "image_url": "https://cdn.unismiles.com/frames/grad-2026-gold.png",
    "slot_count": 2,
    "layout_config": {
      "orientation": "horizontal",
      "slots": [
        { "index": 0, "x": 120, "y": 160, "width": 500, "height": 650 }
      ]
    }
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Frame template updated successfully.",
    "data": {
      "id": 3,
      "name": "Graduation Special 2026 (Updated Gold)"
    }
  }
  ```

### 7.5 Delete Frame Template
- **Endpoint & Method:** `DELETE http://localhost:8000/api/frame_templates/:id`
- **Description:** Removes a frame template from the system.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Frame template with ID 3 deleted successfully."
  }
  ```

---

## 8. Session & Transactions Endpoints

### 8.1 Retrieve All Sessions
- **Endpoint & Method:** `GET http://localhost:8000/api/sessions`
- **Description:** Retrieves all session histories, including transaction code and amount.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "count": 1,
    "data": [
      {
        "id": "#US-1720995123456",
        "kiosk_id": "KSK-TLKM-01",
        "frame_template_id": 1,
        "status": "completed",
        "created_at": "2026-07-15T10:30:00.000Z",
        "amount": "35000.00",
        "payment_method": "QRIS"
      }
    ]
  }
  ```

### 8.2 Retrieve Session by ID
- **Endpoint & Method:** `GET http://localhost:8000/api/sessions/:id`
- **Description:** Fetches details of a specific session, including code, amount, and payment status.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "id": "#US-1720995123456",
      "kiosk_id": "KSK-TLKM-01",
      "frame_template_id": 1,
      "status": "completed",
      "created_at": "2026-07-15T10:30:00.000Z",
      "transaction_code": "QRIS-PAY-99887766",
      "amount": "35000.00",
      "payment_method": "QRIS",
      "transaction_status": "completed"
    }
  }
  ```

### 8.3 Start New Session
- **Endpoint & Method:** `POST http://localhost:8000/api/sessions/start`
- **Description:** Begins a photobooth session. Generates ID `#US-` plus timestamp if not supplied.
- **Primary Consumer:** Kiosk
- **Authorization:** Yes (x-api-key)
- **Request Headers:**
  - `x-api-key: <api_key>`
- **Request Payload:**
  ```json
  {
    "id": "#US-1721001234567",
    "kiosk_id": "KSK-TLKM-01",
    "frame_template_id": 1
  }
  ```
- **Expected Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Session started successfully.",
    "data": {
      "id": "#US-1721001234567",
      "kiosk_id": "KSK-TLKM-01",
      "frame_template_id": 1,
      "status": "active"
    }
  }
  ```

### 8.4 Complete Session & Record Transaction
- **Endpoint & Method:** `POST http://localhost:8000/api/sessions/:id/complete`
- **Description:** Marks a session `completed` and registers transaction code/amount in an atomic database transaction.
- **Primary Consumer:** Kiosk
- **Authorization:** Yes (x-api-key)
- **Request Headers:**
  - `x-api-key: <api_key>`
- **Request Payload:**
  ```json
  {
    "transaction_code": "QRIS-PAY-99887766",
    "amount": 35000,
    "payment_method": "QRIS",
    "status": "completed"
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Session #US-1721001234567 completed successfully."
  }
  ```

### 8.5 Send Digital Copy via Email (Mocked)
- **Endpoint & Method:** `POST http://localhost:8000/api/sessions/:id/send-email`
- **Description:** Delivers a digital copy download link for captured session images to the specified email.
- **Primary Consumer:** Kiosk
- **Authorization:** Yes (x-api-key)
- **Request Headers:**
  - `x-api-key: <api_key>`
- **Request Payload:**
  ```json
  {
    "email": "customer.smile@gmail.com"
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Digital copy of photo sent successfully to customer.smile@gmail.com.",
    "data": {
      "session_id": "#US-1721001234567",
      "recipient_email": "customer.smile@gmail.com",
      "download_link": "/uploads/1721001255000-123456789.jpg",
      "all_photos": [
        "/uploads/1721001255000-123456789.jpg"
      ]
    }
  }
  ```

---

## 9. Media & Assets Endpoints

### 9.1 Upload Photo
- **Endpoint & Method:** `POST http://localhost:8000/api/photos`
- **Description:** Uploads a captured frame photo associated with a specific session.
- **Primary Consumer:** Kiosk
- **Authorization:** Yes (x-api-key)
- **Request Headers:**
  - `x-api-key: <api_key>`
- **Request Payload (`multipart/form-data`):**
  | Key | Type | Description |
  | :--- | :--- | :--- |
  | `photo` | **File** | Captured photo image file (`.jpg` or `.png`). **Required.** |
  | `session_id` | **Text** | Target session ID (e.g. `#US-1721001234567`). **Required.** |
- **Expected Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Photo uploaded successfully.",
    "data": {
      "id": 15,
      "session_id": "#US-1721001234567",
      "url": "/uploads/1721001255000-123456789.jpg"
    }
  }
  ```

### 9.2 Retrieve Photos by Session ID
- **Endpoint & Method:** `GET http://localhost:8000/api/photos/session/:sessionId`
- **Description:** Retrieves all photo urls linked with the session identifier.
- **Primary Consumer:** Both (Kiosk & Admin Dashboard)
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "count": 1,
    "data": [
      {
        "id": 15,
        "session_id": "#US-1721001234567",
        "url": "/uploads/1721001255000-123456789.jpg"
      }
    ]
  }
  ```

### 9.3 Retrieve Active Filters
- **Endpoint & Method:** `GET http://localhost:8000/api/filters`
- **Description:** Retrieves active photo filters available for the camera preview.
- **Primary Consumer:** Kiosk
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "count": 3,
    "data": [
      {
        "id": 1,
        "name": "B&W Classic",
        "css_filter": "grayscale(100%) contrast(120%)",
        "is_active": 1
      }
    ]
  }
  ```

### 9.4 Create New Filter
- **Endpoint & Method:** `POST http://localhost:8000/api/filters`
- **Description:** Adds a new filter to the system database catalog.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:**
  ```json
  {
    "name": "Vintage Grain",
    "css_filter": "sepia(20%) contrast(110%) brightness(95%)",
    "is_active": 1
  }
  ```
- **Expected Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Filter created successfully.",
    "data": {
      "id": 4,
      "name": "Vintage Grain",
      "css_filter": "sepia(20%) contrast(110%) brightness(95%)",
      "is_active": 1
    }
  }
  ```

### 9.5 Update Filter
- **Endpoint & Method:** `PUT http://localhost:8000/api/filters/:id`
- **Description:** Updates details and settings of a specific filter.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:**
  ```json
  {
    "name": "Vintage Soft Grain",
    "css_filter": "sepia(15%) contrast(105%)",
    "is_active": 0
  }
  ```
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Filter updated successfully.",
    "data": {
      "id": 4,
      "name": "Vintage Soft Grain",
      "css_filter": "sepia(15%) contrast(105%)",
      "is_active": 0
    }
  }
  ```

### 9.6 Delete Filter
- **Endpoint & Method:** `DELETE http://localhost:8000/api/filters/:id`
- **Description:** Deletes a filter from the database.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Filter with ID 4 deleted successfully."
  }
  ```

---

## 10. Analytics & Logs Endpoints

### 10.1 Log Kiosk Gesture
- **Endpoint & Method:** `POST http://localhost:8000/api/gestures`
- **Description:** Logs hand gestures recognized by physical kiosk vision system.
- **Primary Consumer:** Kiosk
- **Authorization:** Yes (x-api-key)
- **Request Headers:**
  - `x-api-key: <api_key>`
- **Request Payload:**
  ```json
  {
    "session_id": "#US-1721001234567",
    "gesture_type": "V-Sign",
    "confidence_score": 0.98,
    "action_triggered": "take_photo"
  }
  ```
- **Expected Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Gesture logged successfully",
    "data": {
      "id": 42,
      "session_id": "#US-1721001234567",
      "gesture_type": "V-Sign",
      "confidence_score": 0.98,
      "action_triggered": "take_photo"
    }
  }
  ```

### 10.2 Retrieve All Gesture Logs
- **Endpoint & Method:** `GET http://localhost:8000/api/gestures`
- **Description:** Retrieves all recorded computer vision gesture logs.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "count": 1,
    "data": [
      {
        "id": 42,
        "session_id": "#US-1721001234567",
        "gesture_type": "V-Sign",
        "confidence_score": 0.98,
        "action_triggered": "take_photo",
        "created_at": "2026-07-15T12:00:00.000Z"
      }
    ]
  }
  ```

### 10.3 Record Print Log
- **Endpoint & Method:** `POST http://localhost:8000/api/prints`
- **Description:** Records a print log from the kiosk to track print status and monitor paper levels.
- **Primary Consumer:** Kiosk
- **Authorization:** Yes (x-api-key)
- **Request Headers:**
  - `x-api-key: <api_key>`
- **Request Payload:**
  ```json
  {
    "kiosk_id": "KSK-TLKM-01",
    "session_id": "#US-1721001234567",
    "status": "success",
    "paper_stock_left": 142
  }
  ```
- **Expected Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Print log recorded successfully.",
    "data": {
      "id": 88,
      "kiosk_id": "KSK-TLKM-01",
      "session_id": "#US-1721001234567",
      "status": "success",
      "paper_stock_left": 142
    }
  }
  ```

### 10.4 Retrieve All Print Logs
- **Endpoint & Method:** `GET http://localhost:8000/api/prints`
- **Description:** Retrieves recorded print history. Optional `?kiosk_id=...` filter.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "count": 1,
    "data": [
      {
        "id": 88,
        "kiosk_id": "KSK-TLKM-01",
        "session_id": "#US-1721001234567",
        "status": "success",
        "paper_stock_left": 142
      }
    ]
  }
  ```

### 10.5 Get Dashboard Analytics Stats
- **Endpoint & Method:** `GET http://localhost:8000/api/dashboard/stats`
- **Description:** Returns aggregated key performance statistics for the admin panel.
- **Primary Consumer:** Admin Dashboard
- **Authorization:** No (Public)
- **Request Payload:** None
- **Expected Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "total_revenue": 1450000,
      "total_sessions_today": 42,
      "top_frame_templates": [
        {
          "id": 1,
          "name": "Retro Film Strip 3-Slot",
          "category": "Vintage",
          "image_url": "https://cdn.unismiles.com/frames/retro-strip-3.png",
          "usage_count": 18
        }
      ]
    }
  }
  ```

---

## 11. Error Handling & Status Codes

All endpoints return errors in a standardized JSON error format:
```json
{
  "success": false,
  "message": "Please provide required fields: name, css_filter",
  "stack": "Error: Please provide required fields...\n    at filterController.updateFilter..."
}
```
*(Note: `stack` traces are omitted in production environments where `NODE_ENV=production`)*

### Common HTTP Status Codes Table
| Status Code | Name | Typical Trigger |
| :---: | :--- | :--- |
| **200** | `OK` | Request succeeded. |
| **201** | `Created` | New resource created successfully (`POST`). |
| **400** | `Bad Request` | Missing required parameters or malformed body payload. |
| **401** | `Unauthorized` | Missing or invalid auth header (`Authorization` Bearer or `x-api-key`). |
| **403** | `Forbidden` | Provided JWT token has failed signature verification or expired. |
| **404** | `Not Found` | Target path or resource ID does not exist in the database. |
| **409** | `Conflict` | Resource conflict (e.g. duplicate user email or kiosk ID registration). |
| **500** | `Internal Server Error` | Database connection error, query timeout, or general server exception. |
