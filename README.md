# Potato Health Classification System

![Status](https://img.shields.io/badge/Status-Active-green)
![Python](https://img.shields.io/badge/Python-3.10+-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)

An intelligent system for analyzing potato plant health using multispectral imagery (NDVI & NDRE) with Deep Learning. This project consists of a Next.js-based frontend for the user interface and a FastAPI backend for image processing.

## Key Features

- **Multispectral Analysis**: Supports Original (RGB), NIR, Red, and Red Edge band inputs.
- **Vegetation Index Calculation**: Automatically calculates NDVI (Normalized Difference Vegetation Index) and NDRE (Normalized Difference Red Edge).
- **Health Classification**: Uses a Deep Learning model (VGG16) and NDRE thresholding to classify plant areas as "Healthy" or "Unhealthy".
- **Map Visualization**: Displays classification result overlays directly on the original image.
- **PDF Reports**: Generates complete analysis reports with statistics and location metadata automatically.
- **Location Detection**: Automatic GPS metadata extraction from images (supports GeoTIFF and EXIF).

## Technology Stack

### Backend
- **Framework**: FastAPI (Python)
- **Image Processing**: OpenCV, Rasterio, Pillow, scikit-image
- **Machine Learning**: TensorFlow/Keras (VGG16 based model), scikit-learn (KMeans)
- **Server**: Uvicorn

### Frontend
- **Framework**: Next.js 14 (React)
- **Styling**: Tailwind CSS
- **Libraries**: UTIF.js (TIF rendering), html2canvas/jspdf (PDF generation)

## Prerequisites

Before running the application, ensure you have installed:
- **Python** (version 3.9 or newer)
- **Node.js** (version 18 or newer)
- **git**

## Installation and Running (Local Development)

### 1. Clone Repository

```bash
git clone https://github.com/jodypangaribuan/potato-health-analyzer.git
cd potato-health-analyzer
```

### 2. Setup Machine Learning Model

1.  Download the trained model file (`final_vgg16_plant_health100.h5`).
    -   **Download Link**: [Download from Hugging Face](https://huggingface.co/pangaribuan/potato_analyzer_vgg16/resolve/main/final_vgg16_plant_health100.h5?download=true)
2.  Create a `model` folder inside the `backend` directory.
3.  Place the downloaded `.h5` file into `backend/model/`.

    Structure should look like this:
    ```
    backend/model/final_vgg16_plant_health100.h5
    ```

### 3. Setup Backend

Navigate to the backend directory, create a virtual environment, and install dependencies.

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
# venv\Scripts\activate
# Linux/MacOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**Troubleshooting Note:**
If you encounter errors related to OpenBLAS or crashes during processing, ensure the `OPENBLAS_NUM_THREADS` environment variable is set to `1`. This is already handled in `main.py`, but if issues persist, you can set it manually before running the server.

**Run Backend Server:**

The backend server runs on port **22555**.

```bash
# Ensure venv is active
uvicorn main:app --reload --host 0.0.0.0 --port 22555
```

### 4. Setup Frontend

Open a new terminal, navigate to the frontend directory, and install dependencies.

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The frontend will run at [http://localhost:22444](http://localhost:22444).

## 🐳 Running with Docker (Recommended)

To run the entire application (Frontend + Backend) using Docker:

1.  Ensure **Docker** and **Docker Compose** are installed.
2.  Run the following command in the root directory:

    ```bash
    docker-compose up --build -d
    ```

3.  Access the application:
    -   **Frontend**: [http://localhost:8080](http://localhost:8080)
    -   **Backend**: [http://localhost:8080/docs](http://localhost:8080/docs)

4.  To stop the application:

    ```bash
    docker-compose down
    ```

## Usage Guide

1.  Open your browser and visit [http://localhost:8080](http://localhost:8080).
2.  Upload the 4 required image files:
    -   **Original Image (RGB)**: Visual photo of the plant (JPG/PNG).
    -   **NIR Band**: Near-Infrared image (TIF).
    -   **Red Band**: Red band image (TIF).
    -   **Red Edge Band**: Red Edge band image (TIF).
3.  Click the **"Process NDRE and Classification"** button.
4.  Wait for the process to complete. The system will display:
    -   Percentage of healthy vs unhealthy areas.
    -   Health visualization map.
    -   Location metadata (Latitude/Longitude).
5.  You can download the analysis result report in PDF format.

## Project Structure

```
potato-health-analyzer/
├── backend/                # Backend source code (FastAPI)
│   ├── main.py             # Application entry point & server config
│   ├── requirements.txt    # Python library list
│   ├── model/              # Deep Learning model file (.h5)
│   ├── media/              # Storage for uploads & results (temp)
│   └── services/
│       └── image_processor.py  # Main image processing logic
│
├── frontend/               # Frontend source code (Next.js)
│   ├── app/                # Application pages (Home, Results)
│   ├── public/             # Static assets
│   └── package.json        # Node.js library list
│
└── README.md               # Project documentation
```

## Known Issues & Fixes

-   **OpenBLAS Warning/Crash**: If the backend crashes with "OpenBLAS : Program is Terminated", this is due to a threading conflict in numpy/scipy. Solution: Set `OPENBLAS_NUM_THREADS=1` (already applied in `main.py`).
-   **Blank PDF**: If the PDF report has blank pages, ensure `@page` CSS orientation and margins are set to `margin: 0` (already fixed in `results/page.tsx`).

## Credits

Created by Final Project Team 8 (TSTH2).
