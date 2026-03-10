/**
 * upload-helper.js – shared utility for "pick & upload" buttons across admin managers.
 *
 * Usage:
 *   import { bindUploadBtn } from '../js/upload-helper.js';
 *
 *   // In init() – binds once, guarded by dataset.uploadBound:
 *   bindUploadBtn('myBtnId', 'myInputId', this.auth);
 *   bindUploadBtn('myGalleryBtnId', 'galleryJsonTextareaId', this.auth, { multiple: true });
 */

/**
 * Upload a single file to POST /api/upload.
 * Returns the URL string from the server response.
 */
export async function uploadFile(file, auth) {
  const { Authorization } = auth.getAuthHeaders();
  const fd = new FormData();
  fd.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization }, // NO Content-Type – let browser set multipart boundary
    body: fd
  });

  const ct = response.headers.get('content-type');
  if (!response.ok) {
    const err = ct?.includes('application/json')
      ? await response.json()
      : { error: await response.text() };
    throw new Error(err.error || 'Upload selhal');
  }

  return (await response.json()).url;
}

/**
 * Bind a file-pick-and-upload button to a target input/textarea.
 *
 * @param {string}  btnId     - ID of the <button> element
 * @param {string}  targetId  - ID of the <input> or <textarea> to fill
 * @param {object}  auth      - AuthManager instance
 * @param {object}  opts
 * @param {boolean} opts.multiple - If true, allows selecting multiple files and
 *                                  appends URLs as a JSON array into the textarea.
 *                                  If false (default), fills the input with a single URL.
 */
export function bindUploadBtn(btnId, targetId, auth, { multiple = false } = {}) {
  const btn = document.getElementById(btnId);
  if (!btn || btn.dataset.uploadBound) return;
  btn.dataset.uploadBound = '1';

  // Create a hidden file input that the button delegates to
  const fi = document.createElement('input');
  fi.type = 'file';
  fi.accept = 'image/*';
  fi.style.display = 'none';
  if (multiple) fi.multiple = true;
  document.body.appendChild(fi);

  btn.addEventListener('click', () => fi.click());

  fi.addEventListener('change', async () => {
    if (!fi.files.length) return;

    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '…';

    try {
      const target = document.getElementById(targetId);

      if (multiple) {
        // Upload all files, append URLs to existing JSON array in textarea
        const urls = [];
        for (const f of fi.files) {
          urls.push(await uploadFile(f, auth));
        }

        let arr = [];
        try { arr = JSON.parse(target.value || '[]'); } catch {}
        if (!Array.isArray(arr)) arr = [];

        target.value = JSON.stringify([...arr, ...urls]);
      } else {
        target.value = await uploadFile(fi.files[0], auth);
      }
    } catch (err) {
      window.admin.showNotification(err.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = origHTML;
    fi.value = ''; // allow re-selecting the same file
  });
}
