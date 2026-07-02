import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/context/AuthContext'
import { AppRouter } from '@/routes/AppRouter'
import { useTheme } from '@/hooks/useTheme'

function ThemedApp() {
  // Initialise theme on mount so the class is set before render
  useTheme()
  return (
    <>
      <AppRouter />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
          },
        }}
      />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ThemedApp />
    </AuthProvider>
  )
}
