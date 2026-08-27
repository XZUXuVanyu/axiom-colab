#pragma once
#include "cpp_adapter/component_registry.hpp"
namespace app::tools 
{
class NumericalCalcTool final 
{
public:
    using Dependencies = cpp_adapter::TypeList<>;
    static cpp_adapter::ToolDescriptor descriptor();
    cpp_adapter::Json execute(const cpp_adapter::Json& arguments,  cpp_adapter::ToolCallContext& context);
};
} // namespace app::tools
