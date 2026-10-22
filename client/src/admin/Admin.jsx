import React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Navbar from './components/Navbar.jsx'

const Admin = () => {
    const location = useLocation();
    const isDashboard =
        location.pathname === '/admin' ||
        location.pathname === '/admin/';


    return (
        <>
            <div className='flex h-screen w-screen overflow-hidden'>
                <aside className="w-16 md:w-72 shrink-0 overflow-hidden">
                    <Sidebar />
                </aside>

                <main className="flex-1 flex flex-col overflow-hidden bg-gray-50 min-w-0">
                    <Navbar />
                    <section
                        className={`flex-1 overflow-y-auto scrollbar-hidden 
                            }`}
                    >
                        <Outlet />
                    </section>
                </main>


            </div>
        </>
    )
}

export default Admin