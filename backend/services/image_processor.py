"""
Image Processing Service for Potato Health Classification
Ported from cotoh.py with additional classification logic.
"""

import os
import json
import numpy as np
import cv2
import rasterio
from pathlib import Path
from typing import Dict, Any, Optional, List
from sklearn.cluster import KMeans
from skimage.filters import threshold_otsu
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS


class ImageProcessor:
    """Handles spectral image processing and health classification."""
    
    def __init__(self, model_path: str, media_root: str):
        self.model_path = model_path
        self.media_root = Path(media_root)
        self.results_dir = self.media_root / "results"
        self.results_dir.mkdir(parents=True, exist_ok=True)
        
        # Load model lazily
        self._model = None
    
    @property
    def model(self):
        """Lazy load the TensorFlow model."""
        if self._model is None:
            try:
                from tensorflow.keras.models import load_model
                self._model = load_model(self.model_path)
            except Exception as e:
                print(f"Warning: Could not load model: {e}")
                self._model = None
        return self._model
    
    def process_images(
        self,
        original_path: str,
        nir_path: str,
        red_path: str,
        red_edge_path: str,
        session_id: str
    ) -> Dict[str, Any]:
        """
        Main processing pipeline for spectral images.
        
        Returns dict with paths to result images and classification data.
        """
        # Setup output directory
        output_dir = self.results_dir / session_id
        output_dir.mkdir(parents=True, exist_ok=True)
        debug_dir = output_dir / "debug"
        debug_dir.mkdir(exist_ok=True)
        
        results = {}
        
        # 1. Extract GPS metadata (try original first, then spectral bands if missing)
        # Note: Users often upload WhatsApp versions of RGB images (stripped metadata),
        # so we fallback to the TIF bands which usually preserve metadata.
        coordinates = self._extract_gps_metadata(original_path)
        
        if "Latitude" not in coordinates or "Longitude" not in coordinates:
            # Try Red Edge band (usually has good metadata in DJI)
            if os.path.exists(red_edge_path):
                print(f"Metadata missing in original, trying Red Edge: {red_edge_path}")
                alt_coords = self._extract_gps_metadata(red_edge_path)
                if "Latitude" in alt_coords:
                    coordinates.update(alt_coords) # Merge, prefer new values
            
            # Try NIR if still missing
            if ("Latitude" not in coordinates or "Longitude" not in coordinates) and os.path.exists(nir_path):
                print(f"Metadata missing, trying NIR: {nir_path}")
                alt_coords = self._extract_gps_metadata(nir_path)
                if "Latitude" in alt_coords:
                    coordinates.update(alt_coords)

        results["coordinates"] = coordinates
        
        # 2. Create preview of original image
        original_preview_path = self._create_preview(original_path, output_dir / "original_preview.png")
        results["original_preview"] = self._get_relative_path(original_preview_path)
        
        # 3. Generate vegetation mask using NDVI
        mask_path = self._generate_vegetation_mask(
            nir_path, red_path, output_dir, debug_dir, session_id
        )
        
        # 4. Calculate NDRE for health classification
        ndre_map = self._calculate_ndre(nir_path, red_edge_path)
        
        # 5. Classify health zones
        classification_result = self._classify_health_zones(
            original_path, mask_path, ndre_map, output_dir, session_id
        )
        
        results.update(classification_result)
        
        # 6. Save results JSON
        results_json_path = output_dir / "results.json"
        with open(results_json_path, "w") as f:
            json.dump(results, f, indent=2)
        
        return results
    
    def _extract_gps_metadata(self, image_path: str) -> Dict[str, Any]:
        """Extract GPS and datetime metadata from image (supports JPG and GeoTIFF)."""
        metadata = {}
        
        try:
            # 1. Try reading GeoTIFF metadata with Rasterio first
            with rasterio.open(image_path) as src:
                # Get usage date if available from tags
                tags = src.tags()
                if 'TIFFTAG_DATETIME' in tags:
                    metadata['DateTime'] = tags['TIFFTAG_DATETIME']
                
                # Get bounds/coordinates from geotransform if available
                if src.crs:
                    # Get center coordinates
                    center_x = (src.bounds.left + src.bounds.right) / 2
                    center_y = (src.bounds.top + src.bounds.bottom) / 2
                    
                    # Convert to WGS84 (Lat/Lon) if needed
                    if src.crs.to_epsg() != 4326:
                        try:
                            from rasterio.warp import transform
                            lon, lat = transform(src.crs, {'init': 'EPSG:4326'}, [center_x], [center_y])
                            metadata["Latitude"] = f"{lat[0]:.6f}"
                            metadata["Longitude"] = f"{lon[0]:.6f}"
                        except Exception as e:
                            print(f"Coordinate transformation failed: {e}")
                    else:
                        metadata["Latitude"] = f"{center_y:.6f}"
                        metadata["Longitude"] = f"{center_x:.6f}"

            # 2. If no location data found yet, try PIL with modern getexif (better for TIF GPS)
            if "Latitude" not in metadata or "Longitude" not in metadata:
                img = Image.open(image_path)
                
                # Try getting EXIF data
                exif = img.getexif()
                if exif:
                    # Check for GPS IFD (34853 = 0x8825)
                    gps_ifd = exif.get_ifd(34853)
                    
                    if gps_ifd:
                        gps_info = {}
                        for k, v in gps_ifd.items():
                            tag = GPSTAGS.get(k, k)
                            gps_info[tag] = v
                        
                        # Parse coordinates
                        if "GPSLatitude" in gps_info and "GPSLongitude" in gps_info:
                            try:
                                lat = self._convert_gps_to_degrees(gps_info["GPSLatitude"])
                                lon = self._convert_gps_to_degrees(gps_info["GPSLongitude"])
                                
                                if gps_info.get("GPSLatitudeRef") == "S":
                                    lat = -lat
                                if gps_info.get("GPSLongitudeRef") == "W":
                                    lon = -lon
                                
                                metadata["Latitude"] = f"{lat:.6f}"
                                metadata["Longitude"] = f"{lon:.6f}"
                            except Exception as e:
                                print(f"Error parsing GPS coordinates: {e}")
                        
                        if "GPSAltitude" in gps_info:
                            try:
                                alt = float(gps_info["GPSAltitude"])
                                metadata["Altitude"] = f"{alt:.2f} m"
                            except:
                                pass
                    
                    # Also look for DateTime in standard tags if not found in GPS
                    if "DateTime" not in metadata:
                         # 306 is DateTime in standard EXIF tags
                        if 306 in exif:
                            metadata["DateTime"] = exif[306]
                        # Fallback to Tiff tags via tag_v2 if available
                        elif hasattr(img, 'tag_v2') and 306 in img.tag_v2:
                             metadata["DateTime"] = img.tag_v2[306]

            return metadata
            
        except Exception as e:
            print(f"Error extracting metadata: {e}")
            return metadata
    
    def _convert_gps_to_degrees(self, value) -> float:
        """Convert GPS coordinates to decimal degrees."""
        d, m, s = value
        return float(d) + float(m) / 60 + float(s) / 3600
    
    def _create_preview(self, image_path: str, output_path: Path) -> Path:
        """Create a web-friendly preview of the image."""
        try:
            # Try reading with rasterio first (for TIF files)
            with rasterio.open(image_path) as src:
                # Read first 3 bands for RGB preview
                bands = min(3, src.count)
                img_data = src.read(list(range(1, bands + 1)))
                
                # Normalize to 0-255
                img_data = img_data.astype(np.float32)
                for i in range(bands):
                    band = img_data[i]
                    band_min, band_max = np.percentile(band, [2, 98])
                    img_data[i] = np.clip((band - band_min) / (band_max - band_min) * 255, 0, 255)
                
                # Convert to RGB format (H, W, C)
                if bands == 1:
                    preview = np.stack([img_data[0]] * 3, axis=-1).astype(np.uint8)
                else:
                    preview = np.moveaxis(img_data, 0, -1).astype(np.uint8)
                
        except Exception:
            # Fallback to PIL/OpenCV
            preview = cv2.imread(image_path)
            if preview is None:
                preview = np.array(Image.open(image_path).convert("RGB"))
            else:
                preview = cv2.cvtColor(preview, cv2.COLOR_BGR2RGB)
        
        # Save preview
        Image.fromarray(preview).save(output_path)
        return output_path
    
    def _generate_vegetation_mask(
        self,
        nir_path: str,
        red_path: str,
        output_dir: Path,
        debug_dir: Path,
        session_id: str
    ) -> Path:
        """
        Generate vegetation mask using NDVI analysis.
        Ported from cotoh.py generate_nir_mask function.
        """
        # Read NIR and Red bands
        with rasterio.open(nir_path) as src:
            nir = src.read(1).astype(np.float32)
        with rasterio.open(red_path) as src:
            red = src.read(1).astype(np.float32)
        
        # Normalize
        nir_max = np.max(nir)
        red_max = np.max(red)
        if nir_max > 0:
            nir /= nir_max
        if red_max > 0:
            red /= red_max
        
        # Calculate NDVI
        epsilon = 1e-10
        ndvi = (nir - red) / (nir + red + epsilon)
        
        # Save NDVI debug image
        ndvi_vis = ((ndvi + 1) / 2 * 255).astype(np.uint8)
        cv2.imwrite(str(debug_dir / "1_NDVI.png"), ndvi_vis)
        
        # Otsu thresholding
        ndvi_thresh = threshold_otsu(ndvi)
        adjusted_thresh = max(ndvi_thresh - 0.05, 0)
        
        # Binary vegetation mask
        vegetation_mask = (ndvi > adjusted_thresh).astype(np.uint8) * 255
        cv2.imwrite(str(debug_dir / "2_VegetationMask.png"), vegetation_mask)
        
        # Morphological cleaning
        kernel = np.ones((5, 5), np.uint8)
        mask_cleaned = cv2.morphologyEx(vegetation_mask, cv2.MORPH_OPEN, kernel, iterations=2)
        mask_cleaned = cv2.morphologyEx(mask_cleaned, cv2.MORPH_CLOSE, kernel, iterations=4)
        cv2.imwrite(str(debug_dir / "3_MaskCleaned.png"), mask_cleaned)
        
        # KMeans clustering on vegetation areas
        masked_ndvi = np.copy(ndvi)
        masked_ndvi[mask_cleaned == 0] = np.nan
        ndvi_values = masked_ndvi[~np.isnan(masked_ndvi)].reshape(-1, 1)
        
        if len(ndvi_values) < 10:
            # Not enough vegetation detected, return cleaned mask
            mask_path = output_dir / "vegetation_mask.png"
            cv2.imwrite(str(mask_path), mask_cleaned)
            return mask_path
        
        # Cluster into 2 groups
        kmeans = KMeans(n_clusters=2, random_state=42, n_init=10).fit(ndvi_values)
        labels = np.full(masked_ndvi.shape, -1, dtype=np.int32)
        labels[~np.isnan(masked_ndvi)] = kmeans.labels_
        
        # Visualize clusters
        labels_vis = np.where(labels >= 0, (labels + 1) * 127, 0).astype(np.uint8)
        cv2.imwrite(str(debug_dir / "4_KMeansLabels.png"), labels_vis)
        
        # Select target cluster (higher NDVI = healthier vegetation)
        cluster_means = []
        for i in range(2):
            cluster_ndvi = ndvi_values[kmeans.labels_ == i]
            cluster_means.append(np.mean(cluster_ndvi))
        target_cluster = np.argmax(cluster_means)
        
        target_mask = (labels == target_cluster).astype(np.uint8) * 255
        cv2.imwrite(str(debug_dir / "5_TargetCluster.png"), target_mask)
        
        # Filter contours by area
        contours, _ = cv2.findContours(target_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        filtered_mask = np.zeros_like(target_mask)
        
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 1000 < area < 200000:
                cv2.drawContours(filtered_mask, [cnt], -1, 255, -1)
        
        cv2.imwrite(str(debug_dir / "6_FilteredMask.png"), filtered_mask)
        
        # Save final mask
        mask_path = output_dir / "vegetation_mask.png"
        cv2.imwrite(str(mask_path), filtered_mask)
        
        return mask_path
    
    def _calculate_ndre(self, nir_path: str, red_edge_path: str) -> np.ndarray:
        """Calculate NDRE (Normalized Difference Red Edge) index."""
        with rasterio.open(nir_path) as src:
            nir = src.read(1).astype(np.float32)
        with rasterio.open(red_edge_path) as src:
            red_edge = src.read(1).astype(np.float32)
        
        # Normalize
        nir_max = np.max(nir)
        re_max = np.max(red_edge)
        if nir_max > 0:
            nir /= nir_max
        if re_max > 0:
            red_edge /= re_max
        
        # Calculate NDRE
        epsilon = 1e-10
        ndre = (nir - red_edge) / (nir + red_edge + epsilon)
        
        return ndre
    
    def _classify_health_zones(
        self,
        original_path: str,
        mask_path: Path,
        ndre_map: np.ndarray,
        output_dir: Path,
        session_id: str
    ) -> Dict[str, Any]:
        """
        Classify vegetation zones as healthy or unhealthy using NDRE thresholds.
        Creates overlay visualizations.
        """
        # Load original image
        original = cv2.imread(original_path)
        if original is None:
            # Try with rasterio for TIF files
            with rasterio.open(original_path) as src:
                bands = min(3, src.count)
                img_data = src.read(list(range(1, bands + 1)))
                img_data = img_data.astype(np.float32)
                for i in range(bands):
                    band = img_data[i]
                    band_min, band_max = np.percentile(band, [2, 98])
                    img_data[i] = np.clip((band - band_min) / (band_max - band_min) * 255, 0, 255)
                if bands == 1:
                    original = np.stack([img_data[0]] * 3, axis=-1).astype(np.uint8)
                else:
                    original = np.moveaxis(img_data, 0, -1).astype(np.uint8)
                    original = cv2.cvtColor(original, cv2.COLOR_RGB2BGR)
        
        # Load mask
        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
        
        # Resize if needed
        if mask.shape != original.shape[:2]:
            mask = cv2.resize(mask, (original.shape[1], original.shape[0]))
        if ndre_map.shape != original.shape[:2]:
            ndre_map = cv2.resize(ndre_map, (original.shape[1], original.shape[0]))
        
        # Classify based on NDRE threshold
        ndre_threshold = 0.2  # NDRE values above this are considered healthy
        healthy_mask = (ndre_map > ndre_threshold) & (mask > 0)
        unhealthy_mask = (ndre_map <= ndre_threshold) & (mask > 0)
        
        # Create overlay before labels
        overlay_before = original.copy()
        overlay_before[mask > 0] = cv2.addWeighted(
            overlay_before[mask > 0], 0.7,
            np.full_like(overlay_before[mask > 0], [0, 255, 255]),  # Yellow
            0.3, 0
        )
        overlay_before_path = output_dir / "overlay_before_labels.png"
        cv2.imwrite(str(overlay_before_path), overlay_before)
        
        # Create final overlay with health classification
        overlay_final = original.copy()
        
        # Green for healthy, Red for unhealthy
        green_overlay = np.zeros_like(original)
        green_overlay[:] = [0, 255, 0]  # BGR Green
        red_overlay = np.zeros_like(original)
        red_overlay[:] = [0, 0, 255]  # BGR Red
        
        # Apply healthy zones (green)
        overlay_final[healthy_mask] = cv2.addWeighted(
            overlay_final[healthy_mask], 0.6,
            green_overlay[healthy_mask], 0.4, 0
        )
        
        # Apply unhealthy zones (red)
        overlay_final[unhealthy_mask] = cv2.addWeighted(
            overlay_final[unhealthy_mask], 0.6,
            red_overlay[unhealthy_mask], 0.4, 0
        )
        
        final_overlay_path = output_dir / "final_overlay.png"
        cv2.imwrite(str(final_overlay_path), overlay_final)
        
        # Also save as overlay_result for compatibility
        overlay_result_path = output_dir / "overlay_result.png"
        cv2.imwrite(str(overlay_result_path), overlay_final)
        
        # Calculate statistics
        total_vegetation = np.sum(mask > 0)
        healthy_area = np.sum(healthy_mask)
        unhealthy_area = np.sum(unhealthy_mask)
        
        if total_vegetation > 0:
            healthy_pct = round(healthy_area / total_vegetation * 100, 2)
            unhealthy_pct = round(unhealthy_area / total_vegetation * 100, 2)
        else:
            healthy_pct = 0
            unhealthy_pct = 0
        
        # Find contours for zone count
        healthy_contours, _ = cv2.findContours(
            healthy_mask.astype(np.uint8) * 255,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        unhealthy_contours, _ = cv2.findContours(
            unhealthy_mask.astype(np.uint8) * 255,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        # Filter small contours
        min_contour_area = 500
        healthy_zones = len([c for c in healthy_contours if cv2.contourArea(c) > min_contour_area])
        unhealthy_zones = len([c for c in unhealthy_contours if cv2.contourArea(c) > min_contour_area])
        
        classification_summary = [{
            "zona_sehat": float(healthy_pct),
            "zona_tidak_sehat": float(unhealthy_pct),
            "mean_confidence": float(round(np.mean(ndre_map[mask > 0]) if total_vegetation > 0 else 0, 4)),
            "num_zones": int(healthy_zones + unhealthy_zones),
            "sehat_zones": int(healthy_zones),
            "sakit_zones": int(unhealthy_zones),
        }]
        
        return {
            "overlay_result": self._get_relative_path(overlay_result_path),
            "overlay_before_labels": self._get_relative_path(overlay_before_path),
            "final_overlay": self._get_relative_path(final_overlay_path),
            "classification_summary": classification_summary,
        }
    
    def _get_relative_path(self, path: Path) -> str:
        """Convert absolute path to path relative to media root."""
        try:
            return str(path.relative_to(self.media_root))
        except ValueError:
            return str(path)
