#include "main_window.hpp"

#include <QApplication>
#include <QStyleFactory>

int main(int argc, char* argv[]) {
    QApplication application(argc, argv);
    application.setApplicationName("C++ Tool Adapter");
    application.setOrganizationName("general-ts-cpp-adapter");
    application.setStyle(QStyleFactory::create("Fusion"));

    application.setStyleSheet(R"(
        QMainWindow, QWidget { background: #181818; color: #e6e6e6; }
        QGroupBox {
            border: 1px solid #3f3f46; border-radius: 4px;
            margin-top: 12px; padding-top: 12px; font-weight: 600;
        }
        QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; }
        QLineEdit, QListWidget, QPlainTextEdit {
            background: #1e1e1e; border: 1px solid #55555b;
            border-radius: 3px; padding: 6px; selection-background-color: #264f78;
        }
        QLineEdit:focus, QListWidget:focus, QPlainTextEdit:focus {
            border-color: #007acc;
        }
        QPushButton {
            background: #2d2d30; border: 1px solid #55555b;
            border-radius: 3px; padding: 7px 14px;
        }
        QPushButton:hover { background: #3e3e42; border-color: #77777d; }
        QPushButton:pressed { background: #007acc; }
        QPushButton:disabled { color: #777777; background: #252526; }
        QPushButton#primaryButton { background: #0e639c; border-color: #1177bb; }
        QPushButton#primaryButton:hover { background: #1177bb; }
        QStatusBar { background: #007acc; color: white; }
    )");

    MainWindow window;
    window.show();
    return application.exec();
}
