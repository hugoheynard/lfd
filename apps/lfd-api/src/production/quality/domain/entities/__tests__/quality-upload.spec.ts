import {
  QualityUploadAlreadyAttachedError,
  QualityUploadNotFoundError,
  QualityUploadReleasedError,
} from "../../errors/quality-record-errors.js";
import { QualityPhoto } from "../../value-objects/quality-photo.js";
import { QualityUpload, type QualityUploadState } from "../quality-upload.js";

const AT = new Date();
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function state(overrides: Partial<QualityUploadState> = {}): QualityUploadState {
  return {
    id: "up_1",
    storageKey: "quality/pending/up_1",
    contentType: "image/jpeg",
    byteSize: 4,
    uploadedBy: "staff_sup",
    uploadedAt: AT,
    attachedTo: null,
    releasedAt: null,
    ...overrides,
  };
}

describe("QualityUpload", () => {
  it("un dépôt neuf est rangé sous quality/pending/<id>, libre et non libéré", () => {
    const upload = QualityUpload.deposit({
      id: "up_9",
      photo: QualityPhoto.create(JPEG),
      uploadedBy: "staff_sup",
      uploadedAt: AT,
    });
    expect(upload.storageKey).toBe("quality/pending/up_9");
    expect(upload.attachedTo).toBeNull();
    expect(() => upload.assertAttachableBy("staff_sup")).not.toThrow();
  });

  it("refuse le dépôt d'autrui comme introuvable, un dépôt rattaché, un dépôt balayé", () => {
    expect(() => QualityUpload.restore(state()).assertAttachableBy("staff_x")).toThrow(
      QualityUploadNotFoundError,
    );
    expect(() =>
      QualityUpload.restore(state({ attachedTo: "chk_1" })).assertAttachableBy("staff_sup"),
    ).toThrow(QualityUploadAlreadyAttachedError);
    expect(() =>
      QualityUpload.restore(state({ releasedAt: AT })).assertAttachableBy("staff_sup"),
    ).toThrow(QualityUploadReleasedError);
  });
});
