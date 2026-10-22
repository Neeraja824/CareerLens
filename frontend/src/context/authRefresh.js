export async function refreshCurrentUser({ getCurrentUser, setUser, logout, setLoading }) {
  try {
    const response = await getCurrentUser()
    setUser(response.data.student)
    return response.data.student
  } catch (error) {
    if (error?.response?.status === 401) {
      logout()
    }

    return null
  } finally {
    setLoading(false)
  }
}
