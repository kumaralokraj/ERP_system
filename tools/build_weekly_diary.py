from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
XML = "http://www.w3.org/XML/1998/namespace"

ET.register_namespace("w", W)
ET.register_namespace("r", R)


def qn(name):
    return f"{{{W}}}{name}"


def local_name(element):
    return element.tag.rsplit("}", 1)[-1]


def set_paragraph_text(paragraph, text):
    text_elements = paragraph.findall(".//" + qn("t"))
    if not text_elements:
        run = ET.SubElement(paragraph, qn("r"))
        text_element = ET.SubElement(run, qn("t"))
        text_elements = [text_element]

    for index, text_element in enumerate(text_elements):
        text_element.text = text if index == 0 else ""
        if text and (text[0].isspace() or text[-1].isspace()):
            text_element.set(f"{{{XML}}}space", "preserve")


def clone_paragraph(template, text):
    paragraph = deepcopy(template)
    set_paragraph_text(paragraph, text)
    return paragraph


def set_cell_paragraphs(cell, texts, template_for_text):
    for child in list(cell):
        if local_name(child) != "tcPr":
            cell.remove(child)

    for role, text in texts:
        cell.append(clone_paragraph(template_for_text(role), text))


def cell_paragraph(cell, fallback=None):
    paragraph = cell.find(qn("p"))
    return paragraph if paragraph is not None else fallback


def set_cell_text(cell, text):
    paragraph = cell_paragraph(cell)
    if paragraph is None:
        paragraph = ET.SubElement(cell, qn("p"))
    set_cell_texts = [("default", text)]
    set_cell_paragraphs(cell, set_cell_texts, lambda _role: paragraph)


def make_page_break():
    paragraph = ET.Element(qn("p"))
    run = ET.SubElement(paragraph, qn("r"))
    br = ET.SubElement(run, qn("br"))
    br.set(qn("type"), "page")
    return paragraph


weeks = [
    {
        "days": "Day: Wed, Thurs, Fri, Sat",
        "date": "Date: 01.04.2026 - 04.04.2026",
        "product": "School Management System Project Setup",
        "points": [
            "Reviewed requirements for the School Management System admin and student workflows.",
            "Set up the MERN project structure with React/Vite frontend and Express backend.",
            "Planned modules for students, teachers, classes, books, uniforms, fees, results, and announcements.",
            "Studied MongoDB collections and relationships required for school operations.",
            "Prepared initial routes, assets, and dashboard navigation for the application.",
        ],
        "description": [
            "Understood the goal of building one system to manage daily school administration from both admin and student sides.",
            "Finalized the main stack using React, Vite, Node.js, Express.js, MongoDB, Mongoose, Axios, and Tailwind CSS.",
            "Separated the project into frontend and backend folders so both parts could be developed and tested independently.",
            "Mapped the important data entities such as students, teachers, classes, books, uniforms, fees, users, and announcements.",
            "Prepared the initial working plan for implementing core modules first and improving reporting and automation later.",
            "Started arranging reusable UI assets and page routes so the project could grow module by module.",
        ],
    },
    {
        "days": "Day: Mon, Tue, Wed, Thurs, Fri, Sat",
        "date": "Date: 06.04.2026 - 11.04.2026",
        "product": "Admin and Student Portal Foundation",
        "points": [
            "Created the base frontend structure for admin and student portals.",
            "Implemented login flow, protected routing, and authentication context handling.",
            "Designed sidebar and navbar layouts for smooth module navigation.",
            "Connected admin, student, authentication, and notification context providers.",
            "Started basic pages for dashboard, profile, students, teachers, and classes.",
        ],
        "description": [
            "Built the main React application routing so admin and student users could access separate sections.",
            "Added authentication handling for login, token storage, and route protection before opening secured pages.",
            "Created common layout components such as sidebar, navbar, table, pagination, modal, and loader components.",
            "Prepared the admin dashboard structure with links for students, teachers, classes, fees, books, uniforms, and settings.",
            "Prepared the student dashboard structure with pages for profile, fees, books, uniforms, announcements, and settings.",
            "Tested page navigation and corrected early UI issues so the base portal felt consistent before adding heavy features.",
        ],
    },
    {
        "days": "Day: Mon, Tue, Wed, Thurs, Fri, Sat",
        "date": "Date: 13.04.2026 - 18.04.2026",
        "product": "Academic Structure and Access Control",
        "points": [
            "Configured backend server, static frontend hosting, and deployment-related settings.",
            "Developed academic structure services for classes, sessions, enrollments, and legacy class handling.",
            "Improved admin profile, student, teacher, class, book, and uniform controller flows.",
            "Added validation utilities, notification context, and cleaner form handling.",
            "Implemented user, role, and permission management with protected frontend and backend access.",
        ],
        "description": [
            "Updated the Express server to support API routes, frontend build hosting, environment configuration, and deployment settings.",
            "Created academic structure logic to manage class sessions, student enrollment history, and legacy class migration needs.",
            "Added migration and cleanup scripts so existing data could be converted into the improved academic structure safely.",
            "Built admin profile updates and strengthened request validation for more reliable form submissions.",
            "Introduced user management screens and permission constants so access could be controlled by role and feature.",
            "Connected backend authentication and permission middleware with React protected routes to prevent unauthorized module access.",
        ],
    },
    {
        "days": "Day: Mon, Tue, Wed, Thurs, Fri, Sat",
        "date": "Date: 20.04.2026 - 25.04.2026",
        "product": "Core Administration Modules",
        "points": [
            "Enhanced student, teacher, and class management pages with CRUD operations.",
            "Built profile views for students, teachers, and admin users.",
            "Improved books and uniform inventory screens for admin use.",
            "Connected frontend forms with backend controllers and validation logic.",
            "Refined dashboard, announcements, search, filters, and reusable UI components.",
        ],
        "description": [
            "Worked on the main master-data modules required by the school admin to manage daily records.",
            "Improved student list and profile screens so student details, class data, and related module links could be accessed quickly.",
            "Improved teacher and class screens to support adding, updating, viewing, and deleting records with proper validation.",
            "Developed book and uniform inventory pages so item data could be maintained from the admin side.",
            "Added reusable modals, table controls, form validation, and notification feedback to make module actions easier to use.",
            "Tested API integration from the UI and fixed issues related to incorrect payloads, missing values, and route handling.",
        ],
    },
    {
        "days": "Day: Mon, Tue, Wed, Thurs, Fri, Sat",
        "date": "Date: 27.04.2026 - 02.05.2026",
        "product": "User and Permission Management",
        "points": [
            "Developed user management APIs for creating, updating, listing, and managing users.",
            "Built Manage Users and Create User pages in the admin portal.",
            "Added role-based and permission-based protected routes on the frontend.",
            "Connected permission middleware with backend routes for secure module access.",
            "Tested admin permissions across student, teacher, class, book, uniform, and fee screens.",
        ],
        "description": [
            "Created a permission system so different admin users could be allowed or restricted from specific school modules.",
            "Added backend user APIs and connected them with frontend screens for managing user accounts and assigned permissions.",
            "Created RoleProtectedRoute and PermissionProtectedRoute logic to secure React routes according to the current user.",
            "Updated sidebar and navigation behavior so users mainly see and access modules available to their role.",
            "Applied permission checks on important backend routes to keep protected actions secure even if called directly.",
            "Performed integration testing by switching user permissions and checking whether restricted pages and APIs were blocked correctly.",
        ],
    },
    {
        "days": "Day: Mon, Tue, Wed, Thurs, Fri, Sat",
        "date": "Date: 04.05.2026 - 09.05.2026",
        "product": "Fee Management Foundation",
        "points": [
            "Designed fee-related models for family fees, payments, advances, and student fee settings.",
            "Created utilities for academic months, fee calculation, installment status, and exam fee schedules.",
            "Started backend services for family fee calculation and student fee ledger tracking.",
            "Built the first version of admin fee screens and student fee display pages.",
            "Prepared migration and backfill scripts for fee data linked with academic years.",
        ],
        "description": [
            "Designed the fee module around academic-year data so monthly and exam fees could be tracked properly.",
            "Created calculation helpers to keep total fee, paid amount, pending amount, installment status, and exam fee values consistent.",
            "Added backend services for generating fee ledgers and grouping records at student and family level.",
            "Started connecting the Fees page, StudentFeeProfile page, FamilyFeeProfile page, and student SFees page with API data.",
            "Prepared migration scripts for moving older fee data into academic-year based structures.",
            "Tested fee scenarios such as unpaid, partial, paid, advance payment, and installment changes to identify edge cases.",
        ],
    },
    {
        "days": "Day: Mon, Tue, Wed, Thurs, Fri, Sat",
        "date": "Date: 11.05.2026 - 16.05.2026",
        "product": "Student Bulk Upload and Family Records",
        "points": [
            "Implemented spreadsheet-based student import using XLSX files.",
            "Created StudentBulkUploadModal and frontend upload service for admin use.",
            "Added backend upload middleware, import controller, and import report generation.",
            "Developed family identity logic to group siblings and shared fee records.",
            "Created audit and backfill scripts for family-fee readiness and student fee settings.",
        ],
        "description": [
            "Built the student bulk upload workflow so admins could add many student records through a spreadsheet instead of manual entry.",
            "Added file upload handling on the backend and connected it with the frontend modal and upload service.",
            "Generated import reports to track which rows were imported successfully and which rows needed correction.",
            "Implemented family identity logic so sibling records could be linked for combined family fee handling.",
            "Created backfill scripts to update existing student and family records where required.",
            "Tested import files, validation errors, duplicate cases, and generated reports to make the process safer for real school data.",
        ],
    },
    {
        "days": "Day: Mon, Tue, Wed, Thurs, Fri, Sat",
        "date": "Date: 18.05.2026 - 23.05.2026",
        "product": "Books and Uniform Issue Management",
        "points": [
            "Developed student book profile and student uniform profile pages.",
            "Built global search components for books, uniforms, and fee-related student lookup.",
            "Improved book inventory and book issue tracking from the admin portal.",
            "Implemented uniform inventory, issue records, and issue item tracking.",
            "Connected student-side book and uniform pages with backend data.",
        ],
        "description": [
            "Worked on inventory workflows so the school could manage books and uniforms along with student issue history.",
            "Added student-specific book and uniform profile screens to show assigned items, quantities, dates, and related details.",
            "Created global search components so admins could quickly find a student before opening fee, book, or uniform profiles.",
            "Improved backend models for inventory invoices, student books, uniform inventory, uniform issues, and issue items.",
            "Updated student portal pages so students could view their own books and uniform records.",
            "Tested issue and inventory flows to confirm that saved records appeared correctly on both admin and student screens.",
        ],
    },
    {
        "days": "Day: Mon, Tue, Wed, Thurs, Fri, Sat",
        "date": "Date: 25.05.2026 - 30.05.2026",
        "product": "Promotions, Results and Fee Reports",
        "points": [
            "Developed promotion batch, promotion item, promotion log, and session rollover features.",
            "Added result management models, controllers, and routes.",
            "Completed family fee service improvements, payment handling, advances, and ledger updates.",
            "Built monthly fee report modal and report utilities for admin reporting.",
            "Finalized routing, frontend build output, deployment updates, and end-to-end module testing.",
        ],
        "description": [
            "Implemented promotion workflows so students could be promoted between classes and academic sessions with proper tracking.",
            "Added audit and execution scripts to check promotion readiness and repair promotion execution issues when needed.",
            "Created result-related backend routes and models so exam or academic result records could be maintained in the system.",
            "Completed major family fee calculations, student ledger updates, payment records, advance handling, and monthly reporting features.",
            "Added report utilities and monthly report modal support so admins could review fee data in a structured way.",
            "Built and deployed the updated frontend assets, then tested important flows for fees, promotions, results, books, uniforms, and student records.",
        ],
    },
]

for week in weeks:
    week["points"] = week["points"][:4]
    week["description"] = week["description"][:4]


def build_document():
    source = Path("Daily Process Learning Sheet (2) (1).docx")
    output = Path("School Management System Weekly Diary Report Apr-May 2026.docx")

    with zipfile.ZipFile(source, "r") as package:
        document_xml = package.read("word/document.xml")
        root = ET.fromstring(document_xml)
        body = root.find(qn("body"))
        template_table = next(child for child in body if local_name(child) == "tbl")
        section_properties = next((deepcopy(child) for child in body if local_name(child) == "sectPr"), None)

        rows = template_table.findall(qn("tr"))
        content_cell = rows[3].findall(qn("tc"))[0]
        content_paragraphs = content_cell.findall(qn("p"))
        blank_template = content_paragraphs[0]
        heading_template = content_paragraphs[1]
        item_template = content_paragraphs[3]
        description_template = content_paragraphs[10]

        def template_for_text(role):
            if role == "heading":
                return heading_template
            if role == "item":
                return item_template
            if role == "description":
                return description_template
            return blank_template

        for child in list(body):
            body.remove(child)

        body.append(ET.Element(qn("p")))

        for index, week in enumerate(weeks):
            table = deepcopy(template_table)
            table_rows = table.findall(qn("tr"))

            set_cell_text(table_rows[0].findall(qn("tc"))[0], "Daily Process Learning Sheet -Trg/DD/12 A")

            date_cells = table_rows[1].findall(qn("tc"))
            set_cell_text(date_cells[0], week["days"])
            set_cell_text(date_cells[1], week["date"])

            product_cells = table_rows[2].findall(qn("tc"))
            set_cell_text(product_cells[0], " Department")
            set_cell_text(product_cells[1], " Web Development")
            set_cell_text(product_cells[2], " Name of Finished Product")
            set_cell_text(product_cells[3], " " + week["product"])

            content = [("blank", " "), ("heading", "Main Points of the Week"), ("blank", "")]
            content.extend(("item", point) for point in week["points"])
            content.extend([("blank", ""), ("heading", "Description"), ("blank", "")])
            content.extend(("description", line) for line in week["description"])
            set_cell_paragraphs(table_rows[3].findall(qn("tc"))[0], content, template_for_text)

            set_cell_text(
                table_rows[4].findall(qn("tc"))[0],
                "Signature of Student                                      Signature of Supervisor",
            )

            body.append(table)
            if index != len(weeks) - 1:
                body.append(make_page_break())

        if section_properties is not None:
            body.append(section_properties)

        new_xml = ET.tostring(root, encoding="utf-8", xml_declaration=True, short_empty_elements=False)

        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as out_package:
            for item in package.infolist():
                if item.filename == "word/document.xml":
                    out_package.writestr(item, new_xml)
                else:
                    out_package.writestr(item, package.read(item.filename))

    print(output)


if __name__ == "__main__":
    build_document()
