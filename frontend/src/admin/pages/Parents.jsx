import React from "react";
import Sidebar from '../components/Sidebar.jsx';
//import FormModal from "@/components/FormModal";
import Pagination from "../components/Pagination";
import Table from "../components/Table";
//import TableSearch from "../components/TableSearch";
import { parentsData, role } from "../../lib/data.js";

const columns = [
    {
        header: "Info",
        accessor: "info",
    },
    {
        header: "Student Names",
        accessor: "students",
        className: "hidden md:table-cell",
    },
    {
        header: "Phone",
        accessor: "phone",
        className: "hidden lg:table-cell",
    },
    {
        header: "Address",
        accessor: "address",
        className: "hidden lg:table-cell",
    },
    {
        header: "Actions",
        accessor: "action",
    },
];

const Parents = () => {
    const renderRow = (item) => (
        <tr
            key={item.id}
            className="border-b border-gray-200 even:bg-slate-50 text-sm hover:bg-lamaPurpleLight"
        >
            {/* INFO */}
            <td className="flex items-center gap-4 p-4">
                <div className="flex flex-col">
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="text-xs text-gray-500">{item.email}</p>
                </div>
            </td>

            <td className="hidden md:table-cell">
                {item.students.join(", ")}
            </td>

            <td className="hidden md:table-cell">{item.phone}</td>
            <td className="hidden md:table-cell">{item.address}</td>

            {/* ACTIONS */}
            <td>
                <div className="flex items-center gap-2">
                    {/*role === "admin" && (
            <>
              <FormModal table="parent" type="update" data={item} />
              <FormModal table="parent" type="delete" id={item.id} />
            </>
          )*/}
                </div>
            </td>
        </tr>
    );

    return (
        
                    <div className="bg-white p-4 rounded-md m-4">
                        {/* TOP */}
                        <div className="flex items-center justify-between">
                            <h1 className="hidden md:block text-lg font-semibold">
                                All Parents
                            </h1>

                            <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                                <div className="flex items-center gap-4 self-end">
                                    <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
                                        <img src="/filter.png" alt="Filter" className="w-4 h-4" />
                                    </button>

                                    <button className="w-8 h-8 flex items-center justify-center rounded-full bg-lamaYellow">
                                        <img src="/sort.png" alt="Sort" className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* TABLE (IMPORTANT) */}
                        <div className="mt-4 overflow-x-auto">
                            <Table
                                columns={columns}
                                renderRow={renderRow}
                                data={parentsData}
                            />
                        </div>

                        {/* PAGINATION */}
                        <Pagination />
                    </div>
    );
};

export default Parents;
