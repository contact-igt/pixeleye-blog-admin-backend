import { initializeMediaModels } from '../../database/models/index.js';

initializeMediaModels();

export {
  MediaAsset,
  initializeMediaAssetTable,
  type MediaAssetAttributes,
  type MediaAssetCreationAttributes,
  type MediaAssetInstance,
  type MediaAssetStatic,
  type MediaAssetStatus,
  type MediaProvider,
  type MediaPurpose,
  type MediaVariantRecord
} from '../../database/tables/media-assets.table.js';
