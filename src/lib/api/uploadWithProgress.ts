export interface UploadProgressOptions {
  onProgress?: (progress: number) => void
}

export function uploadFormDataWithProgress<T>(
  url: string,
  formData: FormData,
  options: UploadProgressOptions = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.open('POST', url)
    xhr.responseType = 'text'

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const progress = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)))
      options.onProgress?.(progress)
    }

    xhr.onerror = () => {
      reject(new Error('Không thể tải file lên do lỗi kết nối.'))
    }

    xhr.onload = () => {
      let payload: Record<string, unknown> = {}

      try {
        payload = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : {}
      } catch {
        reject(new Error('API upload trả về dữ liệu không hợp lệ.'))
        return
      }

      if (xhr.status < 200 || xhr.status >= 300 || payload.error) {
        reject(new Error(typeof payload.error === 'string' ? payload.error : `Upload thất bại (${xhr.status}).`))
        return
      }

      resolve(payload as T)
    }

    xhr.send(formData)
  })
}
