import { useState, useEffect } from 'react'

const USER_PHOTO_KEY = 'user_photo'
const USER_PHOTO_EVENT = 'user_photo_updated'

export const useUserPhoto = () => {
  const [userPhoto, setUserPhoto] = useState<string | null>(() => {
    return localStorage.getItem(USER_PHOTO_KEY)
  })

  useEffect(() => {
    // Listener para mudanças na foto
    const handlePhotoUpdate = () => {
      const photo = localStorage.getItem(USER_PHOTO_KEY)
      setUserPhoto(photo)
    }

    window.addEventListener(USER_PHOTO_EVENT, handlePhotoUpdate)

    return () => {
      window.removeEventListener(USER_PHOTO_EVENT, handlePhotoUpdate)
    }
  }, [])

  const updateUserPhoto = (photo: string | null) => {
    if (photo) {
      localStorage.setItem(USER_PHOTO_KEY, photo)
    } else {
      localStorage.removeItem(USER_PHOTO_KEY)
    }
    setUserPhoto(photo)

    // Disparar evento para atualizar outros componentes
    window.dispatchEvent(new Event(USER_PHOTO_EVENT))
  }

  return { userPhoto, updateUserPhoto }
}
