import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, RequireAdmin, RequireAuth } from './auth'
import { CartProvider } from './cart'
import { SiteFooter } from './components/SiteFooter'
import { CartPage } from './pages/CartPage'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrderPage } from './pages/OrderPage'
import { OrdersPage } from './pages/OrdersPage'
import { PackPage } from './pages/PackPage'
import { SettingsPage } from './pages/SettingsPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminTiersPage } from './pages/admin/AdminTiersPage'
import { AdminSupportersPage } from './pages/admin/AdminSupportersPage'
import { AdminTokensPage } from './pages/admin/AdminTokensPage'
import { SupportThanksPage } from './pages/SupportThanksPage'

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/packs/:slug" element={<PackPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/support/thanks" element={<SupportThanksPage />} />
            <Route path="/orders" element={<RequireAuth><OrdersPage /></RequireAuth>} />
            <Route path="/orders/:orderNo" element={<RequireAuth><OrderPage /></RequireAuth>} />
            <Route path="/library" element={<RequireAuth><LibraryPage /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
              <Route index element={<Navigate to="tiers" replace />} />
              <Route path="tiers" element={<AdminTiersPage />} />
              <Route path="supporters" element={<AdminSupportersPage />} />
              <Route path="tokens" element={<AdminTokensPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <SiteFooter />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
